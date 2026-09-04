import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('POST /api/v1/sync/reconcile exposes projection reconciliation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-sync-api-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  let called = false;
  const server = createServer({
    rootDir: root,
    stateStore: {
      async syncFromFiles() { called = true; return { divergences: [], state: { installation: { ready: true } } }; },
      close() {}
    }
  });
  const address = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/sync/reconcile`, { method: 'POST' });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(called, true);
    assert.deepEqual(body.divergences, []);
  } finally {
    await close(server);
  }
});

function listen(server) {
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
