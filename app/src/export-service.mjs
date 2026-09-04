import { runAllowedScript } from './script-adapter.mjs';

export async function createShareableExport({ rootDir, executable = 'pwsh' }) {
  return runAllowedScript('exportar-compartilhavel.ps1', [], { rootDir, executable, timeoutMs: 60_000 });
}
