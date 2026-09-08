import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserAdapter } from '../src/browser-adapter.mjs';
import { createApplicationFlow } from '../src/application-flow.mjs';
import { createPlaywrightDriver } from '../src/playwright-driver.mjs';
import { createAgentEventHandler } from '../src/agent-events.mjs';

test('a completed conversational turn does not terminate the run awaiting user decisions', () => {
  let status = 'running'; let lastTask;
  const runs = { getRun: () => ({ status }), appendEvent() {}, finishRun(_id, next) { status = next; }, recordTask(_id, value) { lastTask = value; } };
  createAgentEventHandler(runs)({ method: 'turn/completed', params: { turn: { status: 'completed' } } }, 'run1');
  assert.equal(status, 'running'); assert.equal(lastTask.task, 'awaiting_input');
});

test('form review refuses a page belonging to a different prepared job', async () => {
  const browser = createBrowserAdapter({ driver: { async snapshot() { return { url: 'https://fixture.test/jobs/B', jobId: 'B' }; } } });
  await assert.rejects(browser.assertContext({ url: 'https://fixture.test/jobs/A' }, { identifierOrUrl: 'https://fixture.test/jobs/A' }), { code: 'checkpoint_mismatch' });
});

test('same-URL SPA job replacement is rejected before any submission click', async () => {
  let clicks = 0;
  const browser = createBrowserAdapter({ driver: { async snapshot() { return { url: 'https://fixture.test/form', jobId: 'B', formHash: 'same' }; }, async state() { return { text: 'Formulário' }; }, async click() { clicks++; } } });
  const flow = createApplicationFlow({ runService: {}, approvalService: { assertApproved() {} }, browserAdapter: browser });
  await assert.rejects(flow.submitApproved({ run: { id: 'r' }, item: { identifierOrUrl: 'https://fixture.test/jobs/A' }, snapshot: { url: 'https://fixture.test/form', formHash: 'same' } }, 'approval', {}), { code: 'checkpoint_mismatch' });
  assert.equal(clicks, 0);
});

test('restart before evidence capture cannot screenshot an unrelated page as confirmation', async () => {
  const prepared = { run: { id: 'r' }, item: { id: 'A', key: 'GUPY|A', identifierOrUrl: 'https://fixture.test/jobs/A' } };
  let captures = 0;
  const workflow = { phase: 'confirmed', prepared, confirmation: { confirmed: true }, approvedPayload: {} };
  const flow = createApplicationFlow({ runService: { getWorkflow: () => workflow }, approvalService: { assertApproved() {} }, browserAdapter: { async verifySubmission() { return { confirmed: false }; }, async captureEvidence() { captures++; return 'wrong.png'; } }, recordApplication: () => { throw new Error('must not record'); } });
  await assert.rejects(flow.submitApproved(prepared, 'approval', {}), { code: 'evidence_confirmation_missing' });
  assert.equal(captures, 0);
});
