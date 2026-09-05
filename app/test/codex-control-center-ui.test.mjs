import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('Codex Control Center UI exposes account usage limits model and effort controls', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  for (const id of ['codex-control-center', 'codex-account', 'codex-usage', 'codex-limits', 'codex-model', 'codex-effort', 'codex-refresh', 'codex-settings-feedback']) assert.match(html, new RegExp(`id=["']${id}["']`));
  for (const marker of ['/api/v1/codex', '/api/v1/codex/refresh', '/api/v1/codex/settings', 'renderCodexControlCenter']) assert.match(app, new RegExp(marker.replaceAll('/', '\\/')));
});
