import { runAllowedScript } from './script-adapter.mjs';
import { acquireFluxoLock } from './lock.mjs';

export async function createShareableExport({ rootDir, executable = 'pwsh', mutationLock = true, lock = () => acquireFluxoLock(rootDir) }) {
  if (!mutationLock || !rootDir) return runAllowedScript('exportar-compartilhavel.ps1', [], { rootDir, executable, timeoutMs: 60_000 });
  const release = await lock();
  try { return await runAllowedScript('exportar-compartilhavel.ps1', [], { rootDir, executable, timeoutMs: 60_000 }); } finally { await release(); }
}
