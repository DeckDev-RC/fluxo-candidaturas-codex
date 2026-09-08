import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConversationProviderService } from '../src/conversation-provider-service.mjs';

test('preferência da interface persiste e vence o fallback legado', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-provider-'));
  const service = createConversationProviderService({ rootDir, fallback: 'codex' });
  const initial = await service.load();
  assert.equal(initial.activeProvider, 'codex');
  assert.equal(initial.consents.skynet.accepted, false);

  const changes = [];
  service.onChange((value) => changes.push(value));
  await service.set('skynet');
  await service.grantConsent('skynet');
  assert.equal(changes.at(-1).activeProvider, 'skynet');
  assert.equal(service.hasConsent('skynet'), true);
  const saved = JSON.parse(await readFile(join(rootDir, 'estado', 'ia-preferences.json'), 'utf8'));
  assert.equal(saved.activeProvider, 'skynet');

  const reloaded = createConversationProviderService({ rootDir, fallback: 'codex' });
  assert.equal((await reloaded.load()).activeProvider, 'skynet');
  assert.equal(reloaded.hasConsent('skynet'), true);
  assert.equal(reloaded.snapshot().source, 'user');
  await assert.rejects(reloaded.set('outro'), { code: 'conversation_provider_invalid' });
});
