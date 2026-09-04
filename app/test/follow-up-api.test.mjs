import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('applications API reads records and registers follow-up events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-follow-up-api-'));
  await mkdir(join(root, 'candidaturas'), { recursive: true });
  await writeFile(join(root, 'candidaturas', 'candidaturas.json'), JSON.stringify([{ id: 'app-1', company: 'Acme', role: 'Dev', status: 'enviada' }]));
  const calls = [];
  const server = createServer({
    rootDir: root,
    followUpService: {
      async recordEvent(input) { calls.push(input); return { status: input.status, reference: input.reference }; }
    }
  });
  const address = await listen(server);

  try {
    const applications = await fetchJson(address, '/api/v1/applications');
    const event = await fetchJson(address, '/api/v1/applications/app-1/events', 'POST', { type: 'status', status: 'triagem' });

    assert.equal(applications.items[0].id, 'app-1');
    assert.equal(event.status, 'triagem');
    assert.equal(calls[0].reference, 'app-1');
  } finally {
    await close(server);
  }
});

async function fetchJson(address, path, method = 'GET', body) {
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  assert.equal(response.ok, true);
  return response.json();
}

function listen(server) {
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
