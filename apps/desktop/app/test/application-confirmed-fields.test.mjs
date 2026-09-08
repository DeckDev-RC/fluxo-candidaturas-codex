import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplicationFlow } from '../src/application-flow.mjs';

test('application flow fills only confirmed profile facts on the observed application form', async () => {
  const actions = [];
  const flow = createApplicationFlow({
    queueService: { async claimNext() { return { id: 'q1', platform: 'GUPY', company: 'Acme', role: 'Backend', identifierOrUrl: 'job-1', key: 'GUPY|job-1' }; } },
    runService: { startRun() { return { id: 'run-1' }; }, appendEvent() {} }, approvalService: {},
    browserAdapter: { async snapshot() { return { url: 'https://example.test/form', dom: { fields: ['name', 'email'] } }; }, async fillConfirmed(facts) { actions.push(facts); return { text: 'form' }; } },
    async recordApplication() {}
  });
  const prepared = await flow.prepareNext();
  const result = await flow.fillConfirmed(prepared, { name: { value: 'Pessoa Teste', confirmed: true }, email: { value: 'ana@example.com', confirmed: false } });
  assert.equal(result.status, 'observed');
  assert.equal(actions[0].name.confirmed, true);
});

test('application flow delegates approved submission to the idempotent browser retry loop', async () => {
  let retryUsed = false;
  const flow = createApplicationFlow({
    queueService: { async claimNext() { return { id: 'q1', platform: 'GUPY', company: 'Acme', role: 'Backend', identifierOrUrl: 'job-1', key: 'GUPY|job-1' }; } },
    runService: { startRun() { return { id: 'run-1' }; }, appendEvent() {}, assertCanSubmit() {}, recordSubmission() {} },
    approvalService: { requestApproval() { return { id: 'approval-1' }; }, assertApproved() {} },
    browserAdapter: { async snapshot() { return { url: 'https://example.test/form' }; }, async submitWithRetry() { retryUsed = true; return { confirmed: true, state: { text: 'Candidatura enviada' } }; }, async captureEvidence() { return 'evidencias/run-1.png'; } },
    evidenceMode: 'confirmation',
    async recordApplication() { return { id: 'app-1' }; }
  });
  const prepared = await flow.prepareNext();
  await flow.submitApproved(prepared, 'approval-1', {});
  assert.equal(retryUsed, true);
});
