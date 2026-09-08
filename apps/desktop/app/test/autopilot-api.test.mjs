import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('POST /api/v1/autopilot/start starts the guided local AI journey', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-autopilot-api-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  let received;
  const server = createServer({ rootDir: root, requireSession: false, autopilotService: { async start(input) { received = input; return { run: { id: 'run-auto-api' }, plan: [], status: 'running' }; } } });
  const address = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/autopilot/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetRoles: 'QA', platforms: ['GUPY'] }) });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).run.id, 'run-auto-api');
    assert.deepEqual(received, { targetRoles: 'QA', platforms: ['GUPY'] });
  } finally { await close(server); }
});

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
