import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueueService } from '../src/queue-service.mjs';
import { createRunService } from '../src/run-service.mjs';

test('queue selection respects campaign exclusions and configurable checkpoint writes', async () => {
  const root = await fixture();
  const service = createQueueService({ rootDir: root, checkpointAfterEachAction: false });
  const item = await service.claimNext();
  assert.equal(item.company, 'Boa Empresa');
  await assert.rejects(() => import('node:fs/promises').then(({ access }) => access(join(root, 'estado', 'checkpoint.json'))), (error) => error.code === 'ENOENT');
});

test('run service enforces the configured application limit and counts submissions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-config-run-'));
  const service = createRunService({ dbPath: join(root, 'run.sqlite'), maxApplicationsPerRun: 1 });
  try {
    const run = service.startRun({ kind: 'campaign' });
    service.assertCanSubmit(run.id, 0);
    service.recordSubmission(run.id);
    assert.equal(service.getRun(run.id).submittedCount, 1);
    assert.throws(() => service.assertCanSubmit(run.id), (error) => error.code === 'run_application_limit_reached');
  } finally { service.close(); }
});

test('queue service honors the runtime failure limit override', async () => {
  const root = await fixture();
  const service = createQueueService({ rootDir: root, maxConsecutiveFailures: 1 });
  await service.claimNext();
  const failure = await service.recordQueueFailure('good', 'blocked by runtime limit');
  assert.equal(failure.status, 'bloqueada');
});

test('queue service serializes direct mutating calls with its injected lock', async () => {
  const root = await fixture(); let acquired = 0; let released = 0;
  const service = createQueueService({ rootDir: root, lock: async () => { acquired += 1; return async () => { released += 1; }; } });
  await service.addQueueItem({ platform: 'GUPY', company: 'Nova', role: 'Dev', identifierOrUrl: 'new' });
  assert.equal(acquired, 1); assert.equal(released, 1);
});

test('queue service creates a backup before direct JSON mutation', async () => {
  const root = await fixture();
  await createQueueService({ rootDir: root }).addQueueItem({ platform: 'GUPY', company: 'Backup', role: 'Dev', identifierOrUrl: 'backup' });
  await import('node:fs/promises').then(({ access }) => access(join(root, 'fila', 'vagas.json.bak')));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-config-'));
  for (const directory of ['estado', 'campanha', 'fila', 'candidaturas']) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ platforms: [{ name: 'GUPY', enabled: true, goal: 5 }], exclusions: ['Empresa Ruim'] }));
  await writeFile(join(root, 'fila', 'vagas.json'), JSON.stringify([{ id: 'bad', key: 'bad', platform: 'GUPY', company: 'Empresa Ruim', role: 'Dev', identifierOrUrl: 'bad', status: 'na fila', priority: 'A' }, { id: 'good', key: 'good', platform: 'GUPY', company: 'Boa Empresa', role: 'Dev', identifierOrUrl: 'good', status: 'na fila', priority: 'B' }]));
  await writeFile(join(root, 'candidaturas', 'candidaturas.json'), '[]');
  return root;
}
