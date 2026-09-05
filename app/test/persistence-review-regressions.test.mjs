import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initializeNewFluxoPersistence } from '../src/persistence-authority.mjs';
import { createCampaignService } from '../src/campaign-service.mjs';

test('external JSON drift blocks ordinary SQLite writes and preserves authoritative data', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-drift-'));
  const p = await initializeNewFluxoPersistence({ rootDir });
  try {
    await p.saveCampaign({ name: 'original', platforms: [] });
    await mkdir(join(rootDir, 'fila'));
    await writeFile(join(rootDir, 'fila', 'vagas.json'), '[{"id":"outside"}]');
    await assert.rejects(p.saveCampaign({ name: 'wrong', platforms: [] }), { code: 'legacy_drift' });
    assert.equal((await p.getCampaign()).name, 'original');
    await p.reconcileLegacy({ strategy: 'sqlite_wins' });
    await p.saveCampaign({ name: 'accepted', platforms: [] });
    assert.equal((await p.getCampaign()).name, 'accepted');
  } finally { p.close(); }
});

test('auto discovered service connections expose disposal without closing injected authority', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-disposal-'));
  const p = await initializeNewFluxoPersistence({ rootDir });
  const service = createCampaignService({ rootDir, persistence: p });
  assert.equal(typeof service.close, 'function'); service.close();
  assert.equal(await p.getMode(), 'sqlite'); p.close();
});
