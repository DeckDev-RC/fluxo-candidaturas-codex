import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';
import { createApplicationFlow } from '../src/application-flow.mjs';
import { createApprovalService } from '../src/approval-service.mjs';
import { createQueueService } from '../src/queue-service.mjs';
import { createRunService } from '../src/run-service.mjs';

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
    assert.deepEqual(calls[2][3], { fields: { role: 'Dev' } });
  } finally {
    await close(server);
  }
});

test('application flow HTTP submits the real approved payload without hashing approvalId', async () => {
  const root = await fixtureRoot();
  const runService = createRunService({ dbPath: join(root, 'estado', 'harness.sqlite') });
  const approvalService = createApprovalService({ dbPath: join(root, 'estado', 'harness.sqlite') });
  let recorded;
  const applicationFlow = createApplicationFlow({
    queueService: createQueueService({ rootDir: root, mutationLock: false }),
    runService,
    approvalService,
    browserAdapter: { async snapshot() { return {}; }, async verifySubmission() { return { confirmed: true, state: { text: 'enviada' } }; } },
    async recordApplication(input) { recorded = input; return { id: 'app-1', status: 'enviada' }; }
  });
  const server = createServer({ rootDir: root, runService, approvalService, applicationFlow });
  const address = await listen(server);

  try {
    const prepared = await post(address, '/api/v1/applications/prepare', {});
    const approval = await post(address, `/api/v1/applications/${prepared.run.id}/approval`, { fields: { role: 'Dev' } });
    await post(address, `/api/v1/approvals/${approval.id}/decision`, { decision: 'approved' });
    const submitted = await post(address, `/api/v1/applications/${prepared.run.id}/submit`, { approvalId: approval.id, fields: { role: 'Dev' } });
    assert.equal(submitted.application.status, 'enviada');
    assert.deepEqual(recorded.payload, { fields: { role: 'Dev' } });
  } finally {
    await close(server);
    runService.close();
    approvalService.close();
  }
});

async function post(address, path, body) {
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  assert.equal(response.ok, true, `${response.status} ${await response.clone().text()}`);
  return response.json();
}

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-flow-api-real-'));
  for (const directory of ['estado', 'campanha', 'fila', 'candidaturas']) await mkdir(join(root, directory), { recursive: true });
  await Promise.all([
    writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ platforms: [{ name: 'GUPY', enabled: true, goal: 1 }] })),
    writeFile(join(root, 'fila', 'vagas.json'), JSON.stringify([{ id: 'q1', key: 'GUPY|1', platform: 'GUPY', company: 'Acme', role: 'Dev', identifierOrUrl: '1', priority: 'A', status: 'na fila' }])),
    writeFile(join(root, 'candidaturas', 'candidaturas.json'), '[]')
  ]);
  return root;
}
