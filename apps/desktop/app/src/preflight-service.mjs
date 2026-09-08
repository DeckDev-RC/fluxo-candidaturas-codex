import { runAllowedScript } from './script-adapter.mjs';

export async function runPreflight({ rootDir, skipPlaywright = false, executable = 'pwsh' }) {
  const args = ['-AsJson'];
  if (skipPlaywright) args.push('-SkipPlaywright');
  return runAllowedScript('preflight.ps1', args, { rootDir, executable, timeoutMs: 60_000 });
}
