import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlmProvider, LLM_CONTRACT } from '../src/llm-provider.mjs';

test('LLM provider follows one contract, prefers local, and only uses cloud when explicitly enabled', async () => {
  const calls = [];
  const provider = createLlmProvider({ config: { modelProvider: 'local', cloudEnabled: false }, local: { async complete(input) { calls.push(['local', input]); return { text: 'resposta local', usage: { inputTokens: 2, outputTokens: 3 } }; } }, cloud: { async complete() { calls.push(['cloud']); return { text: 'não deveria usar' }; } } });
  const result = await provider.complete({ task: 'fit', input: 'contexto' });
  assert.equal(result.text, 'resposta local');
  assert.equal(calls[0][0], 'local');
  assert.deepEqual(provider.status(), { provider: 'local', model: 'local', cloudEnabled: false, available: true });
  assert.ok(LLM_CONTRACT.input.task && LLM_CONTRACT.output.text);
});

test('LLM provider falls back to safe local reading when configured model is unavailable', async () => {
  const provider = createLlmProvider({ config: { modelProvider: 'cloud', cloudEnabled: false }, local: { async read() { return { text: 'leitura local' }; } } });
  const result = await provider.complete({ task: 'intake', input: 'arquivo' });
  assert.equal(result.fallback, true);
  assert.equal(result.text, 'leitura local');
});
