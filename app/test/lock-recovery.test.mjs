import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { acquireFluxoLock } from '../src/lock.mjs';

test('orphan lock is recovered but live process lock is never stolen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-lock-recovery-'));
  await mkdir(join(root, 'estado'));
  const child = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8', windowsHide: true });
  await writeFile(join(root, 'estado', 'harness.lock'), JSON.stringify({ pid: Number(child.stdout.trim()) }));
  const release = await acquireFluxoLock(root);
  await assert.rejects(acquireFluxoLock(root), { code: 'fluxo_locked' });
  await release();
});
