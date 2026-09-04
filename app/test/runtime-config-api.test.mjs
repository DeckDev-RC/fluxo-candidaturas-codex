import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('GET /api/v1/runtime-config exposes safe controls only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-config-api-'));
  await writeFile(join(root, '.env'), 'MAX_APPLICATIONS_PER_RUN=7\nGUPY_PASSWORD=secret');
  const server = createServer({ rootDir: root });
  const address = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/runtime-config`);
    const config = await response.json();
    assert.equal(response.status, 200);
    assert.equal(config.maxApplicationsPerRun, 7);
    assert.equal(JSON.stringify(config).includes('secret'), false);
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
