import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('GET /api/v1/state exposes safe Fluxo state', async () => {
  const root = await createStateFixture();
  const server = createServer({ rootDir: root });
  const address = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/state`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(body.installation.ready, true);
    assert.equal(JSON.stringify(body).includes('PASSWORD'), false);
  } finally {
    await close(server);
  }
});

test('HTTP server exposes health and rejects unsupported requests', async () => {
  const root = await createStateFixture();
  const server = createServer({ rootDir: root });
  const address = await listen(server);

  try {
    const health = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });

    const missing = await fetch(`http://127.0.0.1:${address.port}/not-found`);
    assert.equal(missing.status, 404);

    const unsupported = await fetch(`http://127.0.0.1:${address.port}/health`, { method: 'POST' });
    assert.equal(unsupported.status, 405);
  } finally {
    await close(server);
  }
});

async function createStateFixture() {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-api-'));
  for (const directory of ['estado', 'campanha', 'fila', 'candidaturas']) {
    await mkdir(join(root, directory), { recursive: true });
  }
  await writeFile(join(root, 'estado', 'preflight.json'), JSON.stringify({ ready: true }));
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ platforms: [] }));
  await writeFile(join(root, 'fila', 'vagas.json'), '[]');
  await writeFile(join(root, 'candidaturas', 'candidaturas.json'), '[]');
  await writeFile(join(root, 'estado', 'checkpoint.json'), JSON.stringify({ phase: 'pronto' }));
  await writeFile(join(root, '.env'), 'GUPY_PASSWORD=do-not-return');
  return root;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
