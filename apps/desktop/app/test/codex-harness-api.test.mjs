import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('Codex API exposes safe snapshot, refresh and persisted model/effort settings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-codex-api-'));
  const harness = { async snapshot() { return { status: 'ready', account: { email: 'ana@example.com', planType: 'plus' }, usage: { summary: { lifetimeTokens: 100 } }, rateLimits: { primary: { usedPercent: 20, resetsAt: 1788576918 } }, models: [{ id: 'gpt-5.6-luna', displayName: 'GPT-5.6-Luna', efforts: ['low', 'medium', 'high'] }] }; }, async refresh() { return this.snapshot(); } };
  const settings = { async get() { return { model: 'gpt-5.6-luna', effort: 'medium', verbosity: 'medium', reasoningSummary: 'auto', source: 'default' }; }, async update(input) { return { ...input, source: 'user' }; } };
  const server = createServer({ rootDir: root, requireSession: false, codexHarnessService: harness, codexSettingsService: settings });
  const address = await listen(server);
  try {
    const snapshot = await fetch(`http://127.0.0.1:${address.port}/api/v1/codex`);
    assert.equal(snapshot.status, 200);
    assert.equal((await snapshot.json()).rateLimits.primary.usedPercent, 20);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/v1/codex/refresh`, { method: 'POST' })).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/v1/codex/settings`)).status, 200);
    const update = await fetch(`http://127.0.0.1:${address.port}/api/v1/codex/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5.6-luna', effort: 'high' }) });
    assert.equal(update.status, 200);
    assert.equal((await update.json()).data.effort, 'high');
  } finally { await close(server); }
});

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
