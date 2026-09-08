import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createPlaywrightDriver } from '../app/src/playwright-driver.mjs';

test('real Chromium reopens after the user closes its window', { timeout: 30_000 }, async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-browser-reopen-'));
  const contexts = [];
  const driver = createPlaywrightDriver({ rootDir, headless: true, browserType: { async launchPersistentContext(...args) { const context = await chromium.launchPersistentContext(...args); contexts.push(context); return context; } } });
  try {
    assert.equal((await driver.snapshot()).url, 'about:blank');
    await contexts[0].close();
    assert.equal((await driver.snapshot()).url, 'about:blank');
    assert.equal(contexts.length, 2);
  } finally { await driver.close(); }
});
