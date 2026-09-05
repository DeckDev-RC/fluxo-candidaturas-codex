import { runAllowedScript } from './script-adapter.mjs';
import { acquireFluxoLock, wrapMutations } from './lock.mjs';
import { openAuthoritativePersistence } from './persistence-authority.mjs';

const EVENT_TYPES = new Set(['status', 'verificação', 'mensagem', 'entrevista', 'teste', 'observação', 'erro']);

export function createFollowUpService({ rootDir = '', persistence = openAuthoritativePersistence({ rootDir }), now = () => new Date(), scriptRunner = (name, args) => runAllowedScript(name, args, { rootDir, persistence }), mutationLock = true, lock = () => acquireFluxoLock(rootDir) }) {
  const service = {
    async recordEvent({ reference, type, status = '', nextAction = '', deadline = '', note = '', evidence = '' }) {
      if (!EVENT_TYPES.has(type)) throw domainError('invalid_event_type', `Tipo de evento inválido: ${type}`);
      if (!String(reference ?? '').trim()) throw domainError('invalid_event', 'Reference é obrigatório.');
      if (await useSqlite(persistence)) {
        const applications = await persistence.getApplications();
        const item = applications.find((entry) => entry.id === reference || entry.key === reference || entry.identifierOrUrl === reference || entry.applicationId === reference);
        if (!item) throw domainError('application_not_found', `Candidatura não encontrada: ${reference}`);
        const timestamp = now().toISOString();
        item.status = status || item.status;
        item.nextAction = nextAction || item.nextAction || '';
        item.deadline = deadline || item.deadline || '';
        item.updatedAt = timestamp;
        item.lastCheckedAt = timestamp;
        item.history = [...(Array.isArray(item.history) ? item.history : []), { type, status: status || '', nextAction: nextAction || '', deadline: deadline || '', note: note || '', evidence: evidence || '', at: timestamp }];
        if (evidence) item.evidence = [...(Array.isArray(item.evidence) ? item.evidence : []), evidence];
        await persistence.replaceApplications(applications);
        return { id: item.id, reference, type, status: item.status, nextAction: item.nextAction, deadline: item.deadline };
      }
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

async function useSqlite(persistence) { return Boolean(persistence?.isSqliteAuthority && await persistence.isSqliteAuthority()); }

function parseOutput(stdout, fallback) {
  try { return JSON.parse(String(stdout).trim()); } catch { return fallback; }
}

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
