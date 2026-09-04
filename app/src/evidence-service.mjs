import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runAllowedScript } from './script-adapter.mjs';
import { acquireFluxoLock, wrapMutations } from './lock.mjs';

const TYPES = new Set(['envio', 'teste', 'entrevista', 'mensagem', 'status', 'outro']);
export function createEvidenceService({ rootDir = '', scriptRunner = (name, args) => runAllowedScript(name, args, { rootDir }), mutationLock = true, lock = () => acquireFluxoLock(rootDir) } = {}) {
  const service = { async record({ sourcePath, reference, type = 'outro' } = {}) {
    if (!safeLocalPath(sourcePath) || !String(reference ?? '').trim() || !TYPES.has(type)) throw domainError('invalid_evidence', 'Fonte, referência e tipo de evidência são obrigatórios.');
    const absoluteSource = join(rootDir, sourcePath);
    try { await stat(absoluteSource); } catch (error) { if (error?.code === 'ENOENT') throw domainError('evidence_source_missing', 'Arquivo de evidência não encontrado.'); throw error; }
    const sha256 = createHash('sha256').update(await readFile(absoluteSource)).digest('hex');
    const result = await scriptRunner('registrar-evidencia.ps1', ['-SourcePath', sourcePath, '-Reference', reference, '-Type', type]);
    if (!result?.ok) throw domainError('evidence_record_failed', 'Não foi possível registrar a evidência.');
    return { path: lastLine(result.stdout), sha256, commandResult: result };
  } };
  return wrapMutations(service, ['record'], { rootDir, mutationLock, lock });
}
function safeLocalPath(value) { const path = String(value ?? '').replaceAll('\\', '/'); return Boolean(path) && !path.startsWith('/') && !/^[a-zA-Z]:\//.test(path) && !path.includes('../') && !/[\0\r\n]/.test(path); }
function lastLine(value) { return String(value ?? '').trim().split(/\r?\n/).filter(Boolean).pop() ?? ''; }
function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
