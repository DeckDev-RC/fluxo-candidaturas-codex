import { runAllowedScript } from './script-adapter.mjs';

export function createApplicationService({ rootDir = '', scriptRunner = (name, args) => runAllowedScript(name, args, { rootDir }) }) {
  return {
    async recordConfirmedApplication({ item, confirmation, evidencePath = '', resume = '', applicationId = '', nextAction = 'Aguardar retorno', notes = '' }) {
      if (confirmation?.confirmed !== true) throw domainError('submission_not_confirmed', 'A plataforma não confirmou o recebimento.');
      if (!String(evidencePath).trim()) throw domainError('evidence_required', 'Evidência de confirmação é obrigatória.');
      if (!isSafeRelativePath(evidencePath, 'evidencias')) throw domainError('invalid_evidence_path', 'Evidência deve ficar em evidencias/.');
      if (resume && !isSafeRelativePath(resume, 'curriculo')) throw domainError('invalid_resume_path', 'Currículo deve ficar em curriculo/.');
      for (const field of ['platform', 'company', 'role', 'identifierOrUrl']) {
        if (!String(item?.[field] ?? '').trim()) throw domainError('invalid_application', `${field} é obrigatório.`);
      }

      const args = [
        '-Platform', String(item.platform), '-Company', String(item.company), '-Role', String(item.role),
        '-IdentifierOrUrl', String(item.identifierOrUrl), '-Status', 'enviada', '-NextAction', nextAction
      ];
      if (resume) args.push('-Resume', resume);
      if (applicationId) args.push('-ApplicationId', applicationId);
      if (evidencePath) args.push('-Evidence', evidencePath);
      if (notes) args.push('-Notes', notes);

      const commandResult = await scriptRunner('nova-candidatura.ps1', args);
      if (!commandResult?.ok) throw domainError('application_record_failed', 'Não foi possível registrar a candidatura.');
      return { record: parseRecord(commandResult.stdout), commandResult };
    }
  };
}

function parseRecord(stdout) {
  try {
    return JSON.parse(String(stdout).trim());
  } catch {
    return { status: 'enviada' };
  }
}

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isSafeRelativePath(value, directory) {
  const normalized = String(value).replaceAll('\\', '/');
  return normalized.startsWith(`${directory}/`) && !normalized.includes('/../') && !normalized.includes('../') && !normalized.startsWith('/');
}
