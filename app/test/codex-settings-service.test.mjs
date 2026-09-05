import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexSettingsService } from '../src/codex-settings-service.mjs';

const catalog = [{ id: 'gpt-5.6-luna', displayName: 'GPT-5.6-Luna', efforts: ['low', 'medium', 'high', 'xhigh'] }, { id: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol', efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] }];

test('Codex settings persist model, effort and presentation controls without secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-codex-settings-'));
  const service = createCodexSettingsService({ rootDir: root, readModels: async () => catalog, now: () => new Date('2026-09-04T12:00:00.000Z') });
  const saved = await service.update({ model: 'gpt-5.6-luna', effort: 'high', verbosity: 'low', reasoningSummary: 'concise', apiKey: 'must-not-persist' });
  assert.equal(saved.model, 'gpt-5.6-luna');
  assert.equal(saved.effort, 'high');
  assert.equal(saved.verbosity, 'low');
  assert.equal(saved.source, 'user');
  assert.doesNotMatch(await readFile(join(root, 'estado', 'codex-settings.json'), 'utf8'), /must-not-persist|apiKey/i);
  assert.deepEqual(await service.get(), saved);
});

test('Codex settings reject an effort unsupported by the selected model', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-codex-settings-validation-'));
  const service = createCodexSettingsService({ rootDir: root, readModels: async () => catalog });
  await assert.rejects(() => service.update({ model: 'gpt-5.6-luna', effort: 'ultra' }), (error) => error.code === 'unsupported_reasoning_effort');
  await assert.rejects(() => service.update({ model: 'unknown-model', effort: 'medium' }), (error) => error.code === 'unsupported_model');
});
