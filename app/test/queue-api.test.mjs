import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('GET /api/v1/queue returns queue summary', async () => {
  const root = await createFixture({
    campaign: { platforms: [{ name: 'GUPY', enabled: true, goal: 1 }] },
    queue: [{ id: 'q1', key: 'GUPY|1', platform: 'GUPY', company: 'Acme', role: 'Dev', status: 'na fila' }]
  });
  const server = createServer({ rootDir: root });
  const address = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/queue`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.items.length, 1);
    assert.equal(body.counts['na fila'], 1);
  } finally {
    await close(server);
  }
});

test('POST /api/v1/queue/items adds a queue item', async () => {
  const root = await createFixture({ campaign: { platforms: [] }, queue: [] });
  const server = createServer({ rootDir: root });
  const address = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/queue/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ platform: 'GUPY', company: 'Acme', role: 'Dev', identifierOrUrl: '123' })
    });
    const body = await response.json();
    const queue = JSON.parse(await readFile(join(root, 'fila', 'vagas.json'), 'utf8'));
    assert.equal(response.status, 201);
    assert.equal(body.platform, 'GUPY');
    assert.equal(queue.length, 1);
  } finally {
    await close(server);
  }
});

test('POST /api/v1/queue/:id/claim claims an eligible item', async () => {
  const root = await createFixture({
    campaign: { platforms: [{ name: 'GUPY', enabled: true, goal: 1 }] },
    queue: [{ id: 'q1', key: 'GUPY|1', platform: 'GUPY', company: 'Acme', role: 'Dev', identifierOrUrl: '1', priority: 'A', status: 'na fila' }]
  });
  const server = createServer({ rootDir: root });
  const address = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/queue/q1/claim`, { method: 'POST' });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, 'em andamento');
    assert.equal(body.attempts, 1);
  } finally {
    await close(server);
  }
});

async function createFixture({ campaign, queue }) {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-queue-api-'));
  for (const directory of ['estado', 'campanha', 'fila', 'candidaturas']) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify(campaign));
  await writeFile(join(root, 'fila', 'vagas.json'), JSON.stringify(queue));
  await writeFile(join(root, 'candidaturas', 'candidaturas.json'), '[]');
  return root;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
