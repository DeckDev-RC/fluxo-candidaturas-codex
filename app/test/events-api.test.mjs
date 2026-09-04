import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('events API appends an event and streams it as SSE', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-events-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  const server = createServer({ rootDir: root });
  const address = await listen(server);

  try {
    const runResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'campaign' })
    });
    const run = await runResponse.json();
    const eventResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/${run.id}/events`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'queue.item_claimed', payload: { id: 'q1' } })
    });
    assert.equal(eventResponse.status, 201);

    const stream = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/${run.id}/events`);
    const body = await stream.text();
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get('content-type'), /^text\/event-stream/);
    assert.match(body, /queue\.item_claimed/);
  } finally {
    await close(server);
  }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
