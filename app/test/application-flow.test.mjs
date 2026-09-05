import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueueService } from '../src/queue-service.mjs';
import { createRunService } from '../src/run-service.mjs';
import { createApprovalService } from '../src/approval-service.mjs';
import { createApplicationFlow } from '../src/application-flow.mjs';

test('application flow connects claim, approval, visual confirmation and record', async () => {
  const root = await fixtureRoot();
  const queueService = createQueueService({ rootDir: root });
  const runService = createRunService({ dbPath: join(root, 'estado', 'harness.sqlite') });
  const approvalService = createApprovalService({ dbPath: join(root, 'estado', 'harness.sqlite') });
  const flow = createApplicationFlow({
    queueService,
    runService,
    approvalService,
    browserAdapter: {
      async snapshot() { return { url: 'https://example.test/apply', text: 'form' }; },
      async verifySubmission() { return { confirmed: true, state: { text: 'Candidatura enviada' } }; }
    },
    async recordApplication(input) { return { id: 'app-1', status: 'enviada', evidence: input.evidence, confirmed: input.confirmation.confirmed }; }
  });

  try {
    const prepared = await flow.prepareNext();
    const approval = flow.requestSubmissionApproval(prepared.run.id, { queueItemId: prepared.item.id, fields: { role: 'Dev' } });
    approvalService.decideApproval(approval.id, { decision: 'approved', actorId: 'candidate' });
    const result = await flow.submitApproved(prepared, approval.id, { queueItemId: prepared.item.id, fields: { role: 'Dev' } });

    assert.equal(result.application.status, 'enviada');
    assert.equal(result.application.confirmed, true);
    assert.equal(result.confirmation.confirmed, true);
  } finally {
    runService.close();
    approvalService.close();
  }
});

test('application flow prepares the queue item selected by the user', async () => {
  let claimInput;
  const flow = createApplicationFlow({
    queueService: { async claimNext(input) { claimInput = input; return { id: 'q-selected', key: 'GUPY|selected', platform: 'GUPY', company: 'Acme', role: 'Dev', identifierOrUrl: 'selected' }; } },
    runService: { startRun() { return { id: 'run-selected' }; }, appendEvent() {} },
    approvalService: {},
    browserAdapter: { async snapshot() { return { url: 'https://example.test' }; } },
    async recordApplication() {}
  });

  await flow.prepareNext({ itemId: 'q-selected', platform: 'GUPY' });
  assert.deepEqual(claimInput, { id: 'q-selected', platform: 'GUPY' });
});

test('application flow refuses to record without visual confirmation', async () => {
  const root = await fixtureRoot();
  const queueService = createQueueService({ rootDir: root });
  const runService = createRunService({ dbPath: join(root, 'estado', 'harness.sqlite') });
  const approvalService = createApprovalService({ dbPath: join(root, 'estado', 'harness.sqlite') });
  let recorded = false;
  const flow = createApplicationFlow({
    queueService, runService, approvalService,
    browserAdapter: { async snapshot() { return {}; }, async verifySubmission() { return { confirmed: false, state: { text: 'formulário' } }; } },
    async recordApplication() { recorded = true; }
  });

  try {
    const prepared = await flow.prepareNext();
    const approval = flow.requestSubmissionApproval(prepared.run.id, { queueItemId: prepared.item.id });
    approvalService.decideApproval(approval.id, { decision: 'approved', actorId: 'candidate' });
    await assert.rejects(() => flow.submitApproved(prepared, approval.id, { queueItemId: prepared.item.id }), (error) => error.code === 'submission_not_confirmed');
    assert.equal(recorded, false);
  } finally {
    runService.close();
    approvalService.close();
  }
});

test('application flow refuses to prepare when preflight is not ready', async () => {
  let claimed = false;
  const flow = createApplicationFlow({
    queueService: { async claimNext() { claimed = true; } },
    runService: {},
    approvalService: {},
    browserAdapter: {},
    preflightReady: async () => false,
    async recordApplication() {}
  });

  await assert.rejects(() => flow.prepareNext(), (error) => error.code === 'preflight_blocked');
  assert.equal(claimed, false);
});

test('application flow captures evidence automatically when confirmation has no path', async () => {
  const root = await fixtureRoot();
  const queueService = createQueueService({ rootDir: root });
  const runService = createRunService({ dbPath: join(root, 'estado', 'harness.sqlite') });
  const approvalService = createApprovalService({ dbPath: join(root, 'estado', 'harness.sqlite') });
  let recorded;
  const flow = createApplicationFlow({ queueService, runService, approvalService,
    browserAdapter: { async snapshot() { return {}; }, async verifySubmission() { return { confirmed: true, state: { text: 'enviada' } }; }, async captureEvidence() { return 'evidencias/auto-run.png'; } },
    async recordApplication(input) { recorded = input; return { id: 'app-1' }; }
  });
  try {
    const prepared = await flow.prepareNext();
    const approval = flow.requestSubmissionApproval(prepared.run.id, {});
    approvalService.decideApproval(approval.id, { decision: 'approved', actorId: 'candidate' });
    await flow.submitApproved(prepared, approval.id, {});
    assert.equal(recorded.payload.evidencePath, 'evidencias/auto-run.png');
  } finally { runService.close(); approvalService.close(); }
});

test('application flow saves a checkpoint before the approval gate', async () => {
  const root = await fixtureRoot(); const checkpoints = [];
  const queueService = createQueueService({ rootDir: root }); const runService = createRunService({ dbPath: join(root, 'estado', 'harness.sqlite') }); const approvalService = createApprovalService({ dbPath: join(root, 'estado', 'harness.sqlite') });
  const flow = createApplicationFlow({ queueService, runService, approvalService, checkpointService: { async save(value) { checkpoints.push(value); } }, browserAdapter: { async snapshot() { return { url: 'https://example.test' }; } }, async recordApplication() {} });
  try { await flow.prepareNext(); assert.equal(checkpoints[0].phase, 'aguardando aprovação'); }
  finally { runService.close(); approvalService.close(); }
});

test('application flow honors disabled checkpoint-after-action configuration', async () => {
  const root = await fixtureRoot(); const queueService = createQueueService({ rootDir: root }); const runService = createRunService({ dbPath: join(root, 'estado', 'harness.sqlite') }); const approvalService = createApprovalService({ dbPath: join(root, 'estado', 'harness.sqlite') }); let saved = false;
  const flow = createApplicationFlow({ queueService, runService, approvalService, checkpointAfterEachAction: false, checkpointService: { async save() { saved = true; } }, browserAdapter: { async snapshot() { return {}; } }, async recordApplication() {} });
  try { await flow.prepareNext(); assert.equal(saved, false); } finally { runService.close(); approvalService.close(); }
});

test('application flow enforces confirmation evidence mode before recording', async () => {
  const root = await fixtureRoot(); const queueService = createQueueService({ rootDir: root }); const runService = createRunService({ dbPath: join(root, 'estado', 'harness.sqlite') }); const approvalService = createApprovalService({ dbPath: join(root, 'estado', 'harness.sqlite') }); let recorded = false;
  const flow = createApplicationFlow({ queueService, runService, approvalService, evidenceMode: 'confirmation', browserAdapter: { async snapshot() { return {}; }, async verifySubmission() { return { confirmed: true, state: {} }; } }, async recordApplication() { recorded = true; } });
  try { const prepared = await flow.prepareNext(); const approval = flow.requestSubmissionApproval(prepared.run.id, {}); approvalService.decideApproval(approval.id, { decision: 'approved', actorId: 'candidate' }); await assert.rejects(() => flow.submitApproved(prepared, approval.id, {}), (error) => error.code === 'evidence_required'); assert.equal(recorded, false); }
  finally { runService.close(); approvalService.close(); }
});

test('application flow stops when the observed page diverges from checkpoint', async () => {
  let claimed = false;
  const flow = createApplicationFlow({ queueService: { async claimNext() { claimed = true; } }, runService: {}, approvalService: {}, browserAdapter: { async reconcile() { return { requiresReview: true, differences: [{ field: 'url' }] }; } }, async recordApplication() {}, checkpointService: { save() {} } });
  await assert.rejects(() => flow.prepareNext({ checkpoint: { url: 'https://old.test' } }), (error) => error.code === 'checkpoint_mismatch');
  assert.equal(claimed, false);
});

test('application flow preserves the evidence hash returned by automatic capture', async () => {
  const root = await fixtureRoot(); const queueService = createQueueService({ rootDir: root }); const runService = createRunService({ dbPath: join(root, 'estado', 'harness.sqlite') }); const approvalService = createApprovalService({ dbPath: join(root, 'estado', 'harness.sqlite') }); let recorded;
  const flow = createApplicationFlow({ queueService, runService, approvalService, browserAdapter: { async snapshot() { return {}; }, async verifySubmission() { return { confirmed: true, state: {} }; }, async captureEvidence() { return { path: 'evidencias/auto.png', sha256: 'a'.repeat(64) }; } }, async recordApplication(input) { recorded = input; return {}; } });
  try { const prepared = await flow.prepareNext(); const approval = flow.requestSubmissionApproval(prepared.run.id, {}); approvalService.decideApproval(approval.id, { decision: 'approved', actorId: 'candidate' }); await flow.submitApproved(prepared, approval.id, {}); assert.equal(recorded.payload.evidenceSha256, 'a'.repeat(64)); assert.equal(runService.listEvents(prepared.run.id).at(-1).payloadJson.includes('evidenceSha256'), true); }
  finally { runService.close(); approvalService.close(); }
});

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-flow-'));
  for (const directory of ['estado', 'campanha', 'fila', 'candidaturas']) await mkdir(join(root, directory), { recursive: true });
  await import('node:fs/promises').then(({ writeFile }) => Promise.all([
    writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ platforms: [{ name: 'GUPY', enabled: true, goal: 1 }] })),
    writeFile(join(root, 'fila', 'vagas.json'), JSON.stringify([{ id: 'q1', key: 'GUPY|1', platform: 'GUPY', company: 'Acme', role: 'Dev', identifierOrUrl: '1', priority: 'A', status: 'na fila' }])),
    writeFile(join(root, 'candidaturas', 'candidaturas.json'), '[]')
  ]));
  return root;
}
