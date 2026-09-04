import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentAdapter } from '../src/agent-adapter.mjs';
import { createBrowserAdapter } from '../src/browser-adapter.mjs';

test('agent adapter initializes, starts a thread and streams a turn', async () => {
  const messages = [];
  const adapter = createAgentAdapter({
    transport: {
      async request(method, params) {
        messages.push({ method, params });
        if (method === 'initialize') return { server: 'local' };
        if (method === 'thread/start') return { thread: { id: 'thr-1' } };
        if (method === 'turn/start') return { turn: { id: 'turn-1' } };
      },
      notify(method, params) { messages.push({ method, params }); }
    }
  });

  const result = await adapter.runTurn('thr-1', 'Ler o estado local');

  assert.equal(messages[0].method, 'initialize');
  assert.equal(messages[1].method, 'initialized');
  assert.equal(messages[2].method, 'turn/start');
  assert.equal(result.turn.id, 'turn-1');
});

test('agent adapter forwards streamed notifications to the harness', async () => {
  const notifications = [];
  const adapter = createAgentAdapter({
    onNotification: (message) => notifications.push(message),
    transport: { async request(method) { if (method === 'initialize') return {}; return { turn: { id: 't-1' } }; }, notify() {} }
  });
  adapter.handleNotification({ method: 'turn/item/stream', params: { text: 'progresso' } });
  assert.deepEqual(notifications[0].params, { text: 'progresso' });
});

test('agent adapter attaches the active run to streamed notifications', async () => {
  let received;
  let adapter;
  adapter = createAgentAdapter({ onNotification: (message, runId) => { received = { message, runId }; }, transport: { async request(method) { if (method === 'initialize') return {}; adapter.handleNotification({ method: 'turn/item/stream', params: { delta: 'x' } }); return {}; }, notify() {} } });
  await adapter.runTurnForRun('run-1', 'thread-1', 'continue');
  assert.equal(received.runId, 'run-1');
});

test('browser adapter requires a fresh snapshot before filling and verifies visual confirmation', async () => {
  const actions = [];
  const adapter = createBrowserAdapter({
    driver: {
      async snapshot() { return { url: 'https://example.test/apply', text: 'Formulário' }; },
      async fill(field, value) { actions.push(['fill', field, value]); },
      async state() { return { url: 'https://example.test/success', text: 'Candidatura enviada' }; }
    }
  });

  await assert.rejects(() => adapter.fill('name', 'Pessoa Teste'), (error) => error.code === 'snapshot_required');
  await adapter.snapshot();
  await adapter.fill('name', 'Pessoa Teste');
  const confirmation = await adapter.verifySubmission();

  assert.deepEqual(actions, [['fill', 'name', 'Pessoa Teste']]);
  assert.equal(confirmation.confirmed, true);
});

test('browser adapter pauses on CAPTCHA or MFA', async () => {
  const adapter = createBrowserAdapter({
    driver: {
      async snapshot() { return { url: 'https://example.test', text: 'CAPTCHA required', challenge: 'captcha' }; }
    }
  });

  await assert.rejects(() => adapter.snapshot(), (error) => error.code === 'manual_intervention_required');
});

test('browser adapter captures a confirmation artifact through the browser driver', async () => {
  const paths = [];
  const adapter = createBrowserAdapter({ driver: { async screenshot(path) { paths.push(path); return { ok: true }; } } });
  assert.equal(await adapter.captureEvidence({ runId: 'run-1' }), 'evidencias/run-1-confirmacao.png');
  assert.equal(paths[0], 'evidencias/run-1-confirmacao.png');
});
