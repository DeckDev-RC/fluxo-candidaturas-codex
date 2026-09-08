import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentAdapter } from '../src/agent-adapter.mjs';
import { createBrowserAdapter } from '../src/browser-adapter.mjs';
import { createPlaywrightDiscoveryAdapter } from '../src/discovery-service.mjs';

test('late notifications retain thread/run association across concurrent turns', async () => {
  const received = [];
  const agent = createAgentAdapter({ transport: { async request(method, params) { return method === 'turn/start' ? { turn: { id: `turn-${params.threadId}` } } : {}; }, notify() {} }, onNotification: (event, runId) => received.push([event.method, runId]) });
  await Promise.all([agent.runTurnForRun('run-a', 'a', 'a'), agent.runTurnForRun('run-b', 'b', 'b')]);
  agent.handleNotification({ method: 'item/agentMessage/delta', params: { threadId: 'a', turnId: 'turn-a', delta: 'observed' } });
  agent.handleNotification({ method: 'turn/completed', params: { threadId: 'b', turn: { id: 'turn-b', status: 'completed' } } });
  assert.deepEqual(received, [['item/agentMessage/delta', 'run-a'], ['turn/completed', 'run-b']]);
});

test('negated or unrelated confirmation never confirms a submission', async () => {
  for (const text of ['Sua candidatura não foi enviada. Tente novamente.', 'Application not submitted', 'Você receberá um email quando sua candidatura for enviada.']) {
    const browser = createBrowserAdapter({ driver: { async state() { return { text }; } } });
    assert.equal((await browser.verifySubmission()).confirmed, false, text);
  }
  const browser = createBrowserAdapter({ driver: { async state() { return { text: 'Candidatura enviada', jobId: 'other' }; } } });
  assert.equal((await browser.verifySubmission({ identifierOrUrl: 'expected' })).confirmed, false);
});

test('ambiguous post-click state does not trigger a second submission', async () => {
  let clicks = 0;
  const browser = createBrowserAdapter({ driver: { async snapshot() { return { text: 'Formulário' }; }, async state() { return { text: 'Aguarde…' }; }, async click() { clicks++; } } });
  await assert.rejects(browser.submitWithRetry('submit', { maxAttempts: 2 }), { code: 'submission_not_confirmed' });
  assert.equal(clicks, 1);
});

test('discovery reads observed job links and rejects unsupported pages', async () => {
  const adapter = createPlaywrightDiscoveryAdapter({ platform: 'GUPY', driver: { async snapshot() { return { url: 'https://example.test/jobs', links: [{ href: 'https://example.test/jobs/1', text: 'Backend', company: 'Empresa' }] }; } } });
  const jobs = await adapter.search();
  assert.equal(jobs.length, 1); assert.equal(jobs[0].company, 'Empresa'); assert.equal(jobs[0].title, 'Backend');
  const unsupported = createPlaywrightDiscoveryAdapter({ driver: { async snapshot() { return { text: 'Unexpected page' }; } } });
  await assert.rejects(unsupported.search(), { code: 'discovery_page_unsupported' });
});
