import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueueService } from '../src/queue-service.mjs';

test('addQueueItem rejects duplicate key and cross-platform fingerprint', async () => {
  const root = await createQueueFixture({
    campaign: { maxConsecutiveFailures: 3, platforms: [{ name: 'GUPY', enabled: true, goal: 1 }] },
    queue: [],
    applications: []
  });
  const service = createQueueService({ rootDir: root });

  await service.addQueueItem({ platform: 'GUPY', company: 'Acme', role: 'Dev', identifierOrUrl: '123' });
  await assert.rejects(
    () => service.addQueueItem({ platform: 'GUPY', company: 'Acme', role: 'Dev', identifierOrUrl: '123/' }),
    (error) => error.code === 'queue_duplicate'
  );
  await assert.rejects(
    () => service.addQueueItem({ platform: 'INFOJOBS', company: 'Acme', role: 'Dev', identifierOrUrl: '456' }),
    (error) => error.code === 'queue_duplicate_cross_platform'
  );
});

test('claimNext selects eligible platform item by priority, fit and deadline', async () => {
  const root = await createQueueFixture({
    campaign: {
      maxConsecutiveFailures: 3,
      platforms: [{ name: 'GUPY', enabled: true, goal: 1 }, { name: 'INFOJOBS', enabled: false, goal: 1 }]
    },
    queue: [
      { id: 'low', key: 'GUPY|low', fingerprint: 'low|dev', platform: 'GUPY', company: 'Low', role: 'Dev', identifierOrUrl: 'low', priority: 'C', fitScore: 100, status: 'na fila', addedAt: '2026-01-01' },
      { id: 'best', key: 'GUPY|best', fingerprint: 'best|dev', platform: 'GUPY', company: 'Best', role: 'Dev', identifierOrUrl: 'best', priority: 'A', fitScore: 70, status: 'na fila', deadline: '2026-12-01', addedAt: '2026-01-02' },
      { id: 'disabled', key: 'INFOJOBS|disabled', fingerprint: 'disabled|dev', platform: 'INFOJOBS', company: 'Disabled', role: 'Dev', identifierOrUrl: 'disabled', priority: 'A', fitScore: 100, status: 'na fila' }
    ],
    applications: []
  });
  const service = createQueueService({ rootDir: root });

  const claimed = await service.claimNext({});
  const checkpoint = JSON.parse(await readFile(join(root, 'estado', 'checkpoint.json'), 'utf8'));

  assert.equal(claimed.id, 'best');
  assert.equal(claimed.status, 'em andamento');
  assert.equal(claimed.attempts, 1);
  assert.equal(checkpoint.applicationKey, 'GUPY|best');
});

test('recordQueueFailure requeues until maximum and then blocks item', async () => {
  const root = await createQueueFixture({
    campaign: { maxConsecutiveFailures: 2, platforms: [{ name: 'GUPY', enabled: true, goal: 1 }] },
    queue: [{ id: 'q1', key: 'GUPY|1', fingerprint: 'acme|dev', platform: 'GUPY', company: 'Acme', role: 'Dev', identifierOrUrl: '1', status: 'em andamento', attempts: 1 }],
    applications: []
  });
  const service = createQueueService({ rootDir: root });

  const first = await service.recordQueueFailure('q1', 'sessão expirada');
  await service.claimNext({});
  const second = await service.recordQueueFailure('q1', 'sessão expirada novamente');

  assert.equal(first.status, 'na fila');
  assert.equal(second.status, 'bloqueada');
  assert.equal(second.attempts, 2);
});

async function createQueueFixture({ campaign, queue, applications }) {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-queue-'));
  for (const directory of ['estado', 'campanha', 'fila', 'candidaturas']) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify(campaign));
  await writeFile(join(root, 'fila', 'vagas.json'), JSON.stringify(queue));
  await writeFile(join(root, 'candidaturas', 'candidaturas.json'), JSON.stringify(applications));
  return root;
}
