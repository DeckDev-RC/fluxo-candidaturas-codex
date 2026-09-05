import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistenceAuthority, initializeNewFluxoPersistence } from '../src/persistence-authority.mjs';
import { createStore } from '../src/store.mjs';

test('explicit migration preserves legacy campaign, queue and applications byte-for-byte in SQLite records', async () => {
  const root = await legacyFixture();
  const authority = createPersistenceAuthority({ rootDir: root });
  try {
    assert.equal(await authority.getMode(), 'json');
    const migration = await authority.migrateLegacy();
    assert.equal(migration.migrated, true);
    assert.equal(await authority.getMode(), 'sqlite');
    assert.deepEqual(await authority.getCampaign(), { id: 'camp-1', createdAt: '2025-01-01T00:00:00Z', extra: { keep: true }, platforms: [] });
    assert.deepEqual(await authority.getQueue(), [{ id: 'queue-1', key: 'GUPY|1', collectedAt: '2025-01-02T00:00:00Z', unknown: ['keep'], status: 'na fila' }]);
    assert.deepEqual(await authority.getApplications(), [{ id: 'application-1', key: 'GUPY|2', submittedAt: '2025-01-03T00:00:00Z', history: [{ at: '2025-01-03T00:00:00Z', type: 'status' }], evidence: [{ path: 'evidencias/prova.png' }], custom: { source: 'legacy' }, status: 'enviada' }]);
    await access(migration.backupDir);
    assert.deepEqual(JSON.parse(await readFile(join(migration.backupDir, 'fila', 'vagas.json'), 'utf8')), await authority.getQueue());
  } finally { authority.close(); }
});

test('migration is idempotent and does not import changed JSON after SQLite becomes authoritative', async () => {
  const root = await legacyFixture();
  const first = createPersistenceAuthority({ rootDir: root });
  await first.migrateLegacy();
  first.close();
  await writeFile(join(root, 'fila', 'vagas.json'), JSON.stringify([{ id: 'outside', key: 'outside', status: 'na fila' }]));
  const authority = createPersistenceAuthority({ rootDir: root });
  try {
    const result = await authority.migrateLegacy();
    assert.equal(result.migrated, false);
    assert.equal((await authority.getQueue())[0].id, 'queue-1');
    assert.deepEqual(await authority.detectLegacyDrift(), ['fila/vagas.json']);
  } finally { authority.close(); }
});

test('invalid legacy JSON rolls back SQLite migration without changing its source files', async () => {
  const root = await legacyFixture();
  const queuePath = join(root, 'fila', 'vagas.json');
  const invalid = '{ invalid json';
  await writeFile(queuePath, invalid);
  const authority = createPersistenceAuthority({ rootDir: root });
  try {
    await assert.rejects(() => authority.migrateLegacy(), (error) => error.code === 'legacy_migration_invalid');
    assert.equal(await authority.getMode(), 'json');
    assert.equal(await readFile(queuePath, 'utf8'), invalid);
  } finally { authority.close(); }
});

test('new empty root initializes SQLite only and compatibility JSON changes require explicit export', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-persistence-new-'));
  const authority = await initializeNewFluxoPersistence({ rootDir: root });
  try {
    assert.equal(await authority.getMode(), 'sqlite');
    await authority.saveCampaign({ id: 'new-campaign', platforms: [], arbitrary: 'kept' });
    await authority.replaceQueue([{ id: 'new-q', key: 'new-q', status: 'na fila', additional: 7 }]);
    await assert.rejects(() => access(join(root, 'fila', 'vagas.json')));
    await authority.exportCompatibility();
    assert.equal(JSON.parse(await readFile(join(root, 'fila', 'vagas.json'), 'utf8'))[0].additional, 7);
  } finally { authority.close(); }
});

test('state store observes SQLite authority and reports legacy drift without reimporting changed JSON', async () => {
  const root = await legacyFixture();
  const authority = createPersistenceAuthority({ rootDir: root });
  await authority.migrateLegacy();
  await authority.saveCampaign({ id: 'sqlite-campaign', platforms: [], source: 'sqlite' });
  authority.close();
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ id: 'external-json', platforms: [] }));
  const store = createStore({ rootDir: root, dbPath: join(root, 'estado', 'harness.sqlite') });
  try {
    const result = await store.syncFromFiles();
    assert.deepEqual(result.divergences, ['campanha/config.json']);
    assert.equal(store.getSnapshot().campaign.id, 'sqlite-campaign');
  } finally { store.close(); }
});

test('explicit migration command migrates a selected root', async () => {
  const root = await legacyFixture();
  const { stdout } = await promisify(execFile)(process.execPath, ['scripts/migrate-persistence.mjs', '--root', root], { cwd: new URL('..', import.meta.url) });
  const result = JSON.parse(stdout);
  assert.equal(result.migrated, true);
  const authority = createPersistenceAuthority({ rootDir: root });
  try { assert.equal(await authority.getMode(), 'sqlite'); } finally { authority.close(); }
});

async function legacyFixture() {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-persistence-legacy-'));
  for (const directory of ['campanha', 'fila', 'candidaturas']) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ id: 'camp-1', createdAt: '2025-01-01T00:00:00Z', extra: { keep: true }, platforms: [] }));
  await writeFile(join(root, 'fila', 'vagas.json'), JSON.stringify([{ id: 'queue-1', key: 'GUPY|1', collectedAt: '2025-01-02T00:00:00Z', unknown: ['keep'], status: 'na fila' }]));
  await writeFile(join(root, 'candidaturas', 'candidaturas.json'), JSON.stringify([{ id: 'application-1', key: 'GUPY|2', submittedAt: '2025-01-03T00:00:00Z', history: [{ at: '2025-01-03T00:00:00Z', type: 'status' }], evidence: [{ path: 'evidencias/prova.png' }], custom: { source: 'legacy' }, status: 'enviada' }]));
  return root;
}
