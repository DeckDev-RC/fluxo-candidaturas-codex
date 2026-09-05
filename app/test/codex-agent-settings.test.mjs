import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentAdapter } from '../src/agent-adapter.mjs';

test('agent adapter injects persisted model and effort into Codex turn/start', async () => {
  const requests = [];
  const adapter = createAgentAdapter({
    settingsService: { async get() { return { model: 'gpt-5.6-luna', effort: 'high', reasoningSummary: 'concise' }; } },
    transport: { async request(method, params) { requests.push({ method, params }); return method === 'initialize' ? {} : { turn: { id: 'turn-1' } }; }, notify() {} }
  });
  await adapter.runTurn('thread-1', 'Pesquisar vagas');
  assert.deepEqual(requests.at(-1), { method: 'turn/start', params: { threadId: 'thread-1', input: [{ type: 'text', text: 'Pesquisar vagas' }], model: 'gpt-5.6-luna', effort: 'high', summary: 'concise' } });
});

test('agent adapter allows a per-turn override without exposing settings secrets', async () => {
  let request;
  const adapter = createAgentAdapter({ settingsService: { async get() { return { model: 'gpt-5.6-luna', effort: 'low', apiKey: 'secret' }; } }, transport: { async request(method, params) { if (method === 'turn/start') request = params; return {}; }, notify() {} } });
  await adapter.runTurn('thread-1', 'Continuar', { model: 'gpt-5.6-sol', effort: 'xhigh' });
  assert.equal(request.model, 'gpt-5.6-sol');
  assert.equal(request.effort, 'xhigh');
  assert.equal('apiKey' in request, false);
});
