import { runAllowedScript } from './script-adapter.mjs';
import { acquireFluxoLock, wrapMutations } from './lock.mjs';

const EVENT_TYPES = new Set(['status', 'verificação', 'mensagem', 'entrevista', 'teste', 'observação', 'erro']);

export function createFollowUpService({ rootDir = '', scriptRunner = (name, args) => runAllowedScript(name, args, { rootDir }), mutationLock = true, lock = () => acquireFluxoLock(rootDir) }) {
  const service = {
    async recordEvent({ reference, type, status = '', nextAction = '', deadline = '', note = '', evidence = '' }) {
      if (!EVENT_TYPES.has(type)) throw domainError('invalid_event_type', `Tipo de evento inválido: ${type}`);
      if (!String(reference ?? '').trim()) throw domainError('invalid_event', 'Reference é obrigatório.');
      const args = ['-Reference', String(reference), '-Type', type];
      for (const [flag, value] of [['-Status', status], ['-NextAction', nextAction], ['-Deadline', deadline], ['-Note', note], ['-Evidence', evidence]]) {
        if (value) args.push(flag, String(value));
      }
      const result = await scriptRunner('registrar-evento.ps1', args);
      if (!result?.ok) throw domainError('event_record_failed', 'Não foi possível registrar o evento.');
      return parseOutput(result.stdout, { status, type, reference });
    }
  };
  return wrapMutations(service, ['recordEvent'], { rootDir, mutationLock, lock });
}

function parseOutput(stdout, fallback) {
  try { return JSON.parse(String(stdout).trim()); } catch { return fallback; }
}

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
