import { runAllowedScript } from './script-adapter.mjs';

export function createLegacyImportService({ rootDir = '', scriptRunner = (name, args) => runAllowedScript(name, args, { rootDir }) } = {}) {
  return { async import({ directory = '', pattern = 'controle_candidaturas_*.md' } = {}) {
    if (directory && (!safePath(directory) || directory.startsWith('/'))) throw domainError('invalid_import_directory', 'Diretório legado inválido.');
    const args = []; if (directory) args.push('-Directory', directory); if (pattern) args.push('-Pattern', pattern);
    const result = await scriptRunner('importar-controles-legados.ps1', args);
    if (!result?.ok) throw domainError('legacy_import_failed', 'Não foi possível importar os controles legados.');
    return { output: String(result.stdout ?? '').trim(), commandResult: result };
  } };
}
function safePath(value) { const path = String(value).replaceAll('\\', '/'); return !/[\0\r\n]/.test(path) && !path.startsWith('/') && !/^[a-zA-Z]:\//.test(path) && !path.includes('../'); }
function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
