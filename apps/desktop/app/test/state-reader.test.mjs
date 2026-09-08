import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFluxoState } from '../src/state-reader.mjs';

test('readFluxoState returns normalized campaign and queue summary', async () => {
  const root = await createFixture({
    preflight: { ready: true, checks: [{ level: 'critical', status: 'ok' }] },
    campaign: {
      totalGoal: 2,
      dailyGoal: 1,
      weeklyGoal: 2,
      platforms: [{ name: 'GUPY', enabled: true, goal: 2 }]
    },
    queue: [
      { id: 'q1', key: 'GUPY:1', platform: 'GUPY', status: 'na fila', priority: 'A', fitScore: 90 },
      { id: 'q2', key: 'GUPY:2', platform: 'GUPY', status: 'em andamento', priority: 'B', fitScore: 70 }
    ],
    applications: [
      { id: 'a1', key: 'GUPY:3', platform: 'GUPY', status: 'enviada' }
    ],
    checkpoint: { phase: 'vaga selecionada', platform: 'GUPY', applicationKey: 'GUPY:2' }
  });

  const state = await readFluxoState(root);

  assert.equal(state.installation.ready, true);
  assert.equal(state.campaign.totalGoal, 2);
  assert.equal(state.queue.counts['na fila'], 1);
  assert.equal(state.queue.counts['em andamento'], 1);
  assert.equal(state.applications.confirmedCount, 1);
  assert.equal(state.checkpoint.applicationKey, 'GUPY:2');
});

test('readFluxoState omits secret files and secret-shaped fields', async () => {
  const root = await createFixture({
    preflight: { ready: true },
    campaign: { platforms: [] },
    queue: [],
    applications: [{ id: 'a1', status: 'rascunho', password: 'must-not-leak' }],
    checkpoint: { phase: 'aguardando usuário', notes: 'safe' },
    env: 'GUPY_PASSWORD=secret-value'
  });

  const state = await readFluxoState(root);
  const serialized = JSON.stringify(state);

  assert.equal(serialized.includes('secret-value'), false);
  assert.equal(serialized.includes('must-not-leak'), false);
  assert.equal('password' in state.applications.items[0], false);
});

test('readFluxoState returns empty safe defaults when optional runtime files are absent', async () => {
  const root = await createFixture({
    preflight: { ready: false },
    campaign: { platforms: [] },
    queue: [],
    applications: [],
    checkpoint: null,
    omitCheckpoint: true
  });

  const state = await readFluxoState(root);

  assert.deepEqual(state.queue.items, []);
  assert.deepEqual(state.applications.items, []);
  assert.equal(state.checkpoint, null);
});

async function createFixture({ preflight, campaign, queue, applications, checkpoint, env, omitCheckpoint = false }) {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-'));
  for (const directory of ['estado', 'campanha', 'fila', 'candidaturas']) {
    await mkdir(join(root, directory), { recursive: true });
  }
  await writeFile(join(root, 'estado', 'preflight.json'), JSON.stringify(preflight));
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify(campaign));
  await writeFile(join(root, 'fila', 'vagas.json'), JSON.stringify(queue));
  await writeFile(join(root, 'candidaturas', 'candidaturas.json'), JSON.stringify(applications));
  if (!omitCheckpoint) await writeFile(join(root, 'estado', 'checkpoint.json'), JSON.stringify(checkpoint));
  if (env) await writeFile(join(root, '.env'), env);
  return root;
}
