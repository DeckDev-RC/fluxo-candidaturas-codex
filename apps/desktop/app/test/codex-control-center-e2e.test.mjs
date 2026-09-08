import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexHarnessService } from '../src/codex-harness-service.mjs';
import { createCodexSettingsService } from '../src/codex-settings-service.mjs';
import { createAgentAdapter } from '../src/agent-adapter.mjs';

test('Codex Control Center fixture refreshes catalog, saves compatible settings and applies them to the next turn', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-codex-e2e-'));
  const rpc = async (method) => ({
    'account/read': { account: { type: 'chatgpt', email: 'fixture@example.com', planType: 'plus' } },
    'account/usage/read': { summary: { lifetimeTokens: 400 } },
    'account/rateLimits/read': { rateLimits: { primary: { usedPercent: 4 } } },
    'model/list': { data: [{ id: 'gpt-5.6-luna', displayName: 'GPT-5.6-Luna', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }] }], nextCursor: null }
  }[method]);
  const harness = createCodexHarnessService({ request: rpc });
  const settings = createCodexSettingsService({ rootDir: root, readModels: async () => (await harness.snapshot()).models, mutationLock: false });
  await settings.update({ model: 'gpt-5.6-luna', effort: 'high' });
  let turnParams;
  const agent = createAgentAdapter({ settingsService: settings, transport: { async request(method, params) { if (method === 'turn/start') turnParams = params; return {}; }, notify() {} } });
  await agent.runTurn('thread-fixture', 'Continuar no contexto');
  assert.equal((await harness.snapshot()).account.planType, 'plus');
  assert.equal((await settings.get()).effort, 'high');
  assert.equal(turnParams.model, 'gpt-5.6-luna');
  assert.equal(turnParams.effort, 'high');
});
