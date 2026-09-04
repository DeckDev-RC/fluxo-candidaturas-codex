import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.mjs';

test('store syncs safe Fluxo JSON state into SQLite projection', async () => {
  const { root, dbPath } = await createFixture();
  const store = createStore({ rootDir: root, dbPath });

  try {
    const result = await store.syncFromFiles();
    const snapshot = store.getSnapshot();

    assert.deepEqual(result.divergences, []);
    assert.equal(snapshot.campaign.totalGoal, 2);
    assert.equal(snapshot.queue.items.length, 1);
    assert.equal(snapshot.applications.confirmedCount, 1);
    assert.equal(JSON.stringify(snapshot).includes('private-secret'), false);
  } finally {
    store.close();
  }
});

test('store reports a changed operational JSON on the next sync', async () => {
  const { root, dbPath } = await createFixture();
  const store = createStore({ rootDir: root, dbPath });

  try {
    await store.syncFromFiles();
    await writeFile(join(root, 'fila', 'vagas.json'), JSON.stringify([]));

    const result = await store.syncFromFiles();

    assert.deepEqual(result.divergences, ['fila/vagas.json']);
    assert.deepEqual(store.getSnapshot().queue.items, []);
  } finally {
    store.close();
  }
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-store-'));
  const dbPath = join(root, 'harness.sqlite');
  for (const directory of ['estado', 'campanha', 'fila', 'candidaturas']) {
    await mkdir(join(root, directory), { recursive: true });
  }
  await writeFile(join(root, 'estado', 'preflight.json'), JSON.stringify({ ready: true, checks: [] }));
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ totalGoal: 2, platforms: [{ name: 'GUPY', enabled: true, goal: 2 }] }));
  await writeFile(join(root, 'fila', 'vagas.json'), JSON.stringify([{ id: 'q1', key: 'GUPY:1', platform: 'GUPY', company: 'Empresa', role: 'Dev', status: 'na fila', priority: 'A', fitScore: 90 }]));
  await writeFile(join(root, 'candidaturas', 'candidaturas.json'), JSON.stringify([{ id: 'a1', key: 'GUPY:2', platform: 'GUPY', company: 'Empresa', role: 'Dev', status: 'enviada' }]));
  await writeFile(join(root, 'estado', 'checkpoint.json'), JSON.stringify(null));
  await writeFile(join(root, '.env'), 'GUPY_PASSWORD=private-secret');
  return { root, dbPath };
}
