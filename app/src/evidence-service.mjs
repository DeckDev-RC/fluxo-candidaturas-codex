import { runAllowedScript } from './script-adapter.mjs';

const TYPES = new Set(['envio', 'teste', 'entrevista', 'mensagem', 'status', 'outro']);
export function createEvidenceService({ rootDir = '', scriptRunner = (name, args) => runAllowedScript(name, args, { rootDir }) } = {}) {
  return { async record({ sourcePath, reference, type = 'outro' } = {}) {
    if (!safeLocalPath(sourcePath) || !String(reference ?? '').trim() || !TYPES.has(type)) throw domainError('invalid_evidence', 'Fonte, referência e tipo de evidência são obrigatórios.');
    const result = await scriptRunner('registrar-evidencia.ps1', ['-SourcePath', sourcePath, '-Reference', reference, '-Type', type]);
    if (!result?.ok) throw domainError('evidence_record_failed', 'Não foi possível registrar a evidência.');
    return { path: lastLine(result.stdout), commandResult: result };
  } };
}
function safeLocalPath(value) { const path = String(value ?? '').replaceAll('\\', '/'); return Boolean(path) && !path.startsWith('/') && !/^[a-zA-Z]:\//.test(path) && !path.includes('../') && !/[\0\r\n]/.test(path); }
function lastLine(value) { return String(value ?? '').trim().split(/\r?\n/).filter(Boolean).pop() ?? ''; }
function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
