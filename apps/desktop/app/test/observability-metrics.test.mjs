import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetricsService } from '../src/metrics-service.mjs';

test('metrics reports Autopilot latency, intervention, retry, duplicate, reconciliation and quality measurements', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-metrics-autopilot-'));
  const service = createMetricsService({
    rootDir: root,
    readOperations: async () => [],
    readRuns: async () => [{ id: 'run-1', status: 'succeeded', startedAt: '2026-09-04T12:00:00.000Z', firstResultAt: '2026-09-04T12:00:01.000Z', finishedAt: '2026-09-04T12:00:03.000Z' }],
    readExceptions: async () => [{ status: 'open', type: 'captcha' }, { status: 'resolved', type: 'missing_data' }],
    readTraces: async () => [{ task: 'discovery', retry: true, duplicate: false, confidence: 'alta' }, { task: 'fit', quality: 90, reconciliation: true }]
  });
  const metrics = await service.get();
  assert.equal(metrics.autopilot.intentToFirstResultMs, 1000);
  assert.equal(metrics.autopilot.timeToFirstConfirmedApplicationMs, 3000);
  assert.equal(metrics.autopilot.interventions, 2);
  assert.equal(metrics.autopilot.retries, 1);
  assert.equal(metrics.autopilot.reconciliations, 1);
  assert.equal(metrics.autopilot.qualityScore, 90);
});
