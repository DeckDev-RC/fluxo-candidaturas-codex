import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('run API creates, reads, pauses and resumes a run', async () => {
  const root = await createRunFixture();
  const server = createServer({ rootDir: root });
  const address = await listen(server);

  try {
    const createdResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'application', platform: 'GUPY', queueReference: 'q1' })
    });
    const created = await createdResponse.json();
    assert.equal(createdResponse.status, 201);

    const pausedResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/${created.id}/interrupt`, { method: 'POST' });
    assert.equal((await pausedResponse.json()).status, 'paused');

    const resumedResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/${created.id}/resume`, { method: 'POST' });
    assert.equal((await resumedResponse.json()).status, 'running');

    const readResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/${created.id}`);
    assert.equal((await readResponse.json()).status, 'running');
  } finally {
    await close(server);
  }
});

async function createRunFixture() {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-run-api-'));
  await mkdir(join(root, 'estado'), { recursive: true });
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
