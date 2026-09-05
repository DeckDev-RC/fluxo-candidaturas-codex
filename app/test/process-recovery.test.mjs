import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunService } from '../src/run-service.mjs';
import { createApprovalService } from '../src/approval-service.mjs';
import { createApplicationFlow } from '../src/application-flow.mjs';

test('paused and completed runs cannot submit', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'fluxo-paused-')), 'db.sqlite');
  const runs = createRunService({ dbPath: path });
  try {
    const run = runs.startRun({ kind: 'application' }); runs.pauseRun(run.id, 'user');
    assert.throws(() => runs.assertCanSubmit(run.id), { code: 'run_not_running' });
    runs.resumeRun(run.id); runs.finishRun(run.id, 'succeeded');
    assert.throws(() => runs.resumeRun(run.id));
    assert.throws(() => runs.assertCanSubmit(run.id), { code: 'run_not_running' });
  } finally { runs.close(); }
});

test('confirmed submission survives restart and retries only local recording', async () => {
  const dbPath = join(await mkdtemp(join(tmpdir(), 'fluxo-recovery-')), 'db.sqlite');
  let runs = createRunService({ dbPath }); const approvals = createApprovalService({ dbPath });
  let clicks = 0; let records = 0;
  const browser = { async snapshot() { return { url: 'https://example.test/jobs/1' }; }, async submitWithRetry() { clicks++; return { confirmed: true, confirmedAt: new Date().toISOString(), state: { text: 'Candidatura enviada', jobId: '1' } }; }, async verifySubmission() { return { confirmed: true, state: { jobId: '1' } }; } };
  const create = () => createApplicationFlow({ runService: runs, approvalService: approvals, queueService: { async claimNext() { return { id: 'q1', key: 'GUPY|1', platform: 'GUPY', identifierOrUrl: 'https://example.test/jobs/1' }; } }, browserAdapter: browser, recordApplication: async () => { if (++records === 1) throw new Error('disk unavailable'); return { id: 'app-1', status: 'enviada' }; } });
  let flow = create();
  const prepared = await flow.prepareNext(); const payload = { queueItemId: 'q1' };
  const approval = flow.requestSubmissionApproval(prepared.run.id, payload);
  approvals.decideApproval(approval.id, { decision: 'approved' }, { actorType: 'user', actorId: 'candidate' });
  await assert.rejects(flow.submitApproved(prepared, approval.id, payload), /disk unavailable/);
  runs.close(); runs = createRunService({ dbPath }); flow = create();
  assert.equal(flow.getPrepared(prepared.run.id).item.id, 'q1');
  const result = await flow.submitApproved(flow.getPrepared(prepared.run.id), approval.id, payload);
  assert.equal(result.application.id, 'app-1'); assert.equal(clicks, 1); assert.equal(records, 2);
  const again = await flow.submitApproved(flow.getPrepared(prepared.run.id), approval.id, payload);
  assert.equal(again.application.id, 'app-1'); assert.equal(records, 2);
  runs.close(); approvals.close();
});
