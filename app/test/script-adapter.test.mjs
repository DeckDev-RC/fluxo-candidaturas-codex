import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runAllowedScript } from '../src/script-adapter.mjs';

test('script adapter rejects scripts outside the Fluxo allowlist', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-script-'));

  await assert.rejects(
    () => runAllowedScript('evil.ps1', [], { rootDir: root }),
    (error) => error.code === 'script_not_allowed'
  );
});

test('script adapter runs an allowed script without shell interpolation and redacts output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-script-'));
  await mkdir(join(root, 'scripts'), { recursive: true });
  await writeFile(join(root, 'scripts', 'preflight.ps1'), "param([string]$Name) Write-Output ('{\"password\":\"secret-value\",\"name\":\"' + $Name + '\",\"ok\":true}')");

  const result = await runAllowedScript('preflight.ps1', ['-Name', 'safe; no command'], { rootDir: root });

  assert.equal(result.exitCode, 0);
  assert.equal(result.ok, true);
  assert.equal(result.stdout.includes('secret-value'), false);
  assert.match(result.stdout, /\[REDACTED\]/);
});
