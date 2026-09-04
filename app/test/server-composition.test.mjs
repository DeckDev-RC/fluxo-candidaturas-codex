import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('server reuses injected run, approval and state services', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-composition-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  let runStarted = false;
  let approvalListed = false;
  let stateClosed = false;
  const injectedRun = {
    startRun() { runStarted = true; return { id: 'run-injected', status: 'running' }; },
    getRun() { return null; }, close() {}
  };
  const injectedApproval = { listApprovals() { approvalListed = true; return []; }, close() {} };
  const injectedState = { close() { stateClosed = true; }, async syncFromFiles() { return { divergences: [] }; } };
  const server = createServer({ rootDir: root, runService: injectedRun, approvalService: injectedApproval, stateStore: injectedState });
  const address = await listen(server);

  try {
    const runResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'campaign' })
    });
    const approvalsResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/approvals`);
    assert.equal((await runResponse.json()).id, 'run-injected');
    assert.deepEqual(await approvalsResponse.json(), []);
    assert.equal(runStarted, true);
    assert.equal(approvalListed, true);
  } finally {
    await close(server);
  }
  assert.equal(stateClosed, false);
});

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
