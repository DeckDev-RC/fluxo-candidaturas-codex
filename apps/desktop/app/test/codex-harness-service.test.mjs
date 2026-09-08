import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexHarnessService } from '../src/codex-harness-service.mjs';

test('Codex harness collects account, usage, limits and model efforts while redacting secrets', async () => {
  const calls = [];
  const service = createCodexHarnessService({ request: async (method, params) => {
    calls.push([method, params]);
    if (method === 'account/read') return { account: { type: 'chatgpt', email: 'ana@example.com', planType: 'plus', accessToken: 'secret' } };
    if (method === 'account/usage/read') return { summary: { lifetimeTokens: 1234 }, dailyUsageBuckets: [{ startDate: '2026-09-04', tokens: 90 }] };
    if (method === 'account/rateLimits/read') return { rateLimits: { primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1788576918 }, secondary: { usedPercent: 85, resetsAt: 1788747944 } } };
    if (method === 'model/list') return { data: [{ id: 'gpt-5.6-luna', displayName: 'GPT-5.6-Luna', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }], apiKey: 'secret' }], nextCursor: null };
    throw new Error(`unexpected ${method}`);
  } });

  const snapshot = await service.snapshot();
  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.account.email, 'ana@example.com');
  assert.equal(snapshot.usage.summary.lifetimeTokens, 1234);
  assert.equal(snapshot.rateLimits.primary.usedPercent, 12);
  assert.deepEqual(snapshot.models[0].efforts, ['low', 'high']);
  assert.equal('accessToken' in snapshot.account, false);
  assert.equal('apiKey' in snapshot.models[0], false);
  assert.deepEqual(calls.map(([method]) => method), ['account/read', 'account/usage/read', 'account/rateLimits/read', 'model/list']);
});

test('Codex harness returns an unavailable snapshot without throwing when app-server is offline', async () => {
  const service = createCodexHarnessService({ request: async () => { throw Object.assign(new Error('offline'), { code: 'agent_closed' }); } });
  const snapshot = await service.snapshot();
  assert.equal(snapshot.status, 'unavailable');
  assert.deepEqual(snapshot.models, []);
  assert.equal(snapshot.error.code, 'agent_closed');
});
