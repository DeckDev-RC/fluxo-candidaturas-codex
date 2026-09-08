import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationProviderService } from '../src/conversation-provider-service.mjs';
import { createRuntimeHealth } from '../src/runtime-health.mjs';

test('saúde mantém os dois logins e troca somente o provedor ativo', async () => {
  const providerService = createConversationProviderService({ fallback: 'skynet' });
  await providerService.load();
  const codexAuth = authFake({ status: 'authenticated', authenticated: true });
  const skynetAuth = authFake({ status: 'authenticated', authenticated: true });
  const health = createRuntimeHealth({
    authService: codexAuth,
    skynetAuthService: skynetAuth,
    providerService,
    codex: () => ({ found: true, path: 'C:/codex.exe', source: 'teste' })
  });

  const skynet = await health.snapshot();
  assert.equal(skynet.mode, 'skynet-hybrid');
  assert.equal(skynet.providers.skynet.available, true);
  assert.equal(skynet.providers.codex.available, true);
  assert.deepEqual(skynet.capabilities, { chat: true, tools: true, autopilot: true });

  const changed = new Promise((resolve) => {
    const stop = health.onChange((value) => { stop(); resolve(value); });
  });
  await providerService.set('codex');
  const codex = await changed;
  assert.equal(codex.mode, 'codex-app-server');
  assert.equal(codex.providers.skynet.available, true);
  assert.equal(codex.providers.codex.available, true);
});

function authFake(initial) {
  const listeners = new Set();
  return {
    status: async () => initial,
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
