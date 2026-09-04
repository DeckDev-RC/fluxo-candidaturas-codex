import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('application flow API prepares, requests approval and submits a prepared run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-flow-api-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  const calls = [];
  const flow = {
    async prepareNext(input) { calls.push(['prepare', input]); return { run: { id: 'run-1' }, item: { id: 'q1' }, snapshot: {} }; },
    requestSubmissionApproval(runId, payload) { calls.push(['approval', runId, payload]); return { id: 'approval-1', status: 'pending' }; },
    async submitApproved(prepared, approvalId, payload) { calls.push(['submit', prepared.run.id, approvalId, payload]); return { application: { id: 'app-1', status: 'enviada' }, confirmation: { confirmed: true } }; }
  };
  const server = createServer({ rootDir: root, applicationFlow: flow });
  const address = await listen(server);

  try {
    const prepared = await post(address, '/api/v1/applications/prepare', { platform: 'GUPY' });
    const approval = await post(address, '/api/v1/applications/run-1/approval', { fields: { role: 'Dev' } });
    const submitted = await post(address, '/api/v1/applications/run-1/submit', { approvalId: 'approval-1', fields: { role: 'Dev' } });

    assert.equal(prepared.run.id, 'run-1');
    assert.equal(approval.id, 'approval-1');
    assert.equal(submitted.application.status, 'enviada');
    assert.deepEqual(calls.map(([name]) => name), ['prepare', 'approval', 'submit']);
  } finally {
    await close(server);
  }
});

async function post(address, path, body) {
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  assert.equal(response.ok, true);
  return response.json();
}

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
