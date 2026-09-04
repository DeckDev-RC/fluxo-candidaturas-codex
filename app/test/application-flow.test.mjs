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
