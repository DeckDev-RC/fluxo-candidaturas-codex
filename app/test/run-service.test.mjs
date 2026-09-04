import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunService } from '../src/run-service.mjs';
import { acquireFluxoLock } from '../src/lock.mjs';

test('run service creates, pauses and resumes a run with idempotent events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-run-'));
  const service = createRunService({ dbPath: join(root, 'harness.sqlite') });

  try {
    const run = service.startRun({ kind: 'application', platform: 'GUPY', queueReference: 'q1' });
    const first = service.appendEvent({ runId: run.id, type: 'run.started', idempotencyKey: 'start-q1' });
    const repeated = service.appendEvent({ runId: run.id, type: 'run.started', idempotencyKey: 'start-q1' });
    const paused = service.pauseRun(run.id, 'aguardando confirmação');
    const resumed = service.resumeRun(run.id);

    assert.equal(first.id, repeated.id);
    assert.equal(paused.status, 'paused');
    assert.equal(resumed.status, 'running');
  } finally {
    service.close();
  }
});

test('reconcile marks interrupted running runs for manual review', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-run-'));
  const service = createRunService({ dbPath: join(root, 'harness.sqlite') });

  try {
    const run = service.startRun({ kind: 'campaign' });
    const result = service.reconcile();

    assert.equal(result.reconciled, 1);
    assert.equal(service.getRun(run.id).status, 'needs_reconcile');
  } finally {
    service.close();
  }
});

test('acquireFluxoLock allows only one local mutator at a time', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-lock-'));
  const release = await acquireFluxoLock(root);

  try {
    await assert.rejects(
      () => acquireFluxoLock(root),
      (error) => error.code === 'fluxo_locked'
    );
  } finally {
    await release();
  }

  const releaseAfter = await acquireFluxoLock(root);
  await releaseAfter();
});

test('run service blocks a submission when the per-run limit is reached', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-run-'));
  const service = createRunService({ dbPath: join(root, 'harness.sqlite'), maxApplicationsPerRun: 1 });

  try {
    const run = service.startRun({ kind: 'campaign' });
    service.assertCanSubmit(run.id, 0);
    assert.throws(() => service.assertCanSubmit(run.id, 1), (error) => error.code === 'run_application_limit_reached');
  } finally {
    service.close();
  }
});
