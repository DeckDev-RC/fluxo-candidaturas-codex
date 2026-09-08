import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetricsService } from '../src/metrics-service.mjs';

test('metrics service calculates operational rates and operation duration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-metrics-'));
  for (const directory of ['estado', 'campanha', 'fila', 'candidaturas']) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, 'estado', 'preflight.json'), JSON.stringify({ ready: true }));
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ platforms: [] }));
  await writeFile(join(root, 'fila', 'vagas.json'), JSON.stringify([{ id: 'q1', status: 'bloqueada', failureCount: 2 }]));
  await writeFile(join(root, 'candidaturas', 'candidaturas.json'), JSON.stringify([{ id: 'a1', status: 'enviada', evidencePath: 'evidencias/a.png', nextAction: 'acompanhar' }]));
  const service = createMetricsService({ rootDir: root, readOperations: async () => [{ status: 'succeeded', startedAt: '2026-09-04T12:00:00Z', finishedAt: '2026-09-04T12:00:02Z' }] });
  const result = await service.get();
  assert.equal(result.totals.blocked, 1);
  assert.equal(result.rates.failure, 0);
  assert.equal(result.timings.averageOperationMs, 2000);
  assert.equal(result.followUp.nextActions, 1);
});
