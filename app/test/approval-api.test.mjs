import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('approval API creates, lists and decides a submission approval', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-approval-api-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  const server = createServer({ rootDir: root });
  const address = await listen(server);

  try {
    const createdRun = await fetchJson(address, '/api/v1/runs', 'POST', { kind: 'application' });
    const requested = await fetchJson(address, '/api/v1/approvals', 'POST', {
      runId: createdRun.id,
      kind: 'submission',
      payload: { company: 'Acme', role: 'Dev', token: 'not-exposed' }
    });
    const listed = await fetchJson(address, '/api/v1/approvals');
    const decided = await fetchJson(address, `/api/v1/approvals/${requested.id}/decision`, 'POST', {
      decision: 'approved', actorId: 'candidate'
    });

    assert.equal(requested.status, 'pending');
    assert.equal('payloadJson' in requested, false);
    assert.equal(requested.payloadSummary.token, undefined);
    assert.equal(listed.length, 1);
    assert.equal(decided.status, 'approved');
    assert.equal(decided.decidedBy, 'local-ui');
  } finally {
    await close(server);
  }
});

test('approval API rejects an agent authority even when the payload omits actorType', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-approval-agent-api-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  const server = createServer({ rootDir: root, actorResolver: () => ({ actorId: 'agent-1', actorType: 'agent' }) });
  const address = await listen(server);
  try {
    const run = await fetchJson(address, '/api/v1/runs', 'POST', { kind: 'application' });
    const approval = await fetchJson(address, '/api/v1/approvals', 'POST', { runId: run.id, kind: 'message', payload: { text: 'Olá' } });
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/approvals/${approval.id}/decision`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approved' })
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'approval_decision_forbidden');
  } finally {
    await close(server);
  }
});

test('approval API previews a changed action before decision', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-approval-preview-api-')); await mkdir(join(root, 'estado'), { recursive: true });
  const server = createServer({ rootDir: root }); const address = await listen(server);
  try {
    const run = await fetchJson(address, '/api/v1/runs', 'POST', { kind: 'application' });
    const approval = await fetchJson(address, '/api/v1/approvals', 'POST', { runId: run.id, kind: 'submission', payload: { role: 'Dev' } });
    const preview = await fetchJson(address, `/api/v1/approvals/${approval.id}/preview`, 'POST', { role: 'Senior' });
    assert.equal(preview.valid, false); assert.equal(preview.diff[0].field, 'payload');
  } finally { await close(server); }
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
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
