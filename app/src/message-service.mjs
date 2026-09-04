import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runAllowedScript } from './script-adapter.mjs';
import { acquireFluxoLock, wrapMutations } from './lock.mjs';

export function createMessageService({ rootDir = '', scriptRunner = (name, args) => runAllowedScript(name, args, { rootDir }), mutationLock = true, lock = () => acquireFluxoLock(rootDir) }) {
  const service = {
    async createDraft({ company, role, recruiterName = '', highlights = [], callToAction = '' }) {
      if (!String(company ?? '').trim() || !String(role ?? '').trim()) throw domainError('invalid_message', 'Empresa e vaga são obrigatórias.');
      const args = ['-Company', String(company), '-Role', String(role)];
      if (recruiterName) args.push('-RecruiterName', recruiterName);
      if (highlights.length) args.push('-Highlights', highlights.join(','));
      if (callToAction) args.push('-CallToAction', callToAction);
      const result = await scriptRunner('gerar-mensagem-recrutador.ps1', args);
      if (!result?.ok) throw domainError('message_generation_failed', 'Não foi possível gerar o rascunho.');
      const output = String(result.stdout ?? '').trim();
      const path = output.split(/\r?\n/).at(-1);
      if (path) {
        try {
          await access(path);
          return { text: await readFile(path, 'utf8'), path };
        } catch {
          // O runner pode devolver o texto diretamente, como nos adapters remotos.
        }
      }
      return { text: output, path: '' };
    }
  };
  return wrapMutations(service, ['createDraft'], { rootDir, mutationLock, lock });
}

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
