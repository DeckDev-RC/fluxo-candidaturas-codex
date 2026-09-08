import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConversationProviderService } from '../src/conversation-provider-service.mjs';

test('preferência da interface persiste e vence o fallback legado', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-provider-'));
  const service = createConversationProviderService({ rootDir, fallback: 'codex' });
  assert.deepEqual(await service.load(), { activeProvider: 'codex', availableProviders: ['skynet', 'codex'], source: 'default' });

  const changes = [];
  service.onChange((value) => changes.push(value));
  await service.set('skynet');
  assert.equal(changes.at(-1).activeProvider, 'skynet');
  const saved = JSON.parse(await readFile(join(rootDir, 'estado', 'ia-preferences.json'), 'utf8'));
  assert.equal(saved.activeProvider, 'skynet');

  const reloaded = createConversationProviderService({ rootDir, fallback: 'codex' });
  assert.equal((await reloaded.load()).activeProvider, 'skynet');
  assert.equal(reloaded.snapshot().source, 'user');
  await assert.rejects(reloaded.set('outro'), { code: 'conversation_provider_invalid' });
});
