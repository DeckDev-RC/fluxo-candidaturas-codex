import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckpointService } from '../src/checkpoint-service.mjs';

test('checkpoint service persists and clears resumable state atomically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-checkpoint-'));
  const service = createCheckpointService({ rootDir: root });
  const saved = await service.save({ phase: 'fila', platform: 'GUPY', applicationKey: 'x' });
  assert.equal(saved.phase, 'fila');
  assert.equal(JSON.parse(await readFile(join(root, 'estado', 'checkpoint.json'), 'utf8')).platform, 'GUPY');
  assert.deepEqual(await service.clear(), { cleared: true });
});
