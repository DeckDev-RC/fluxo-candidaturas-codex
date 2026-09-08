import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';
import { acquireFluxoLock } from '../src/lock.mjs';

test('operations API exposes resume, evidence, assessment, legacy, pending and checkpoint flows', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-operations-api-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  const server = createServer({ rootDir: root,
    resumeService: { extract: async (input) => ({ path: input.path }), fit: async () => ({ score: 90, classification: 'A' }), select: async () => ({ output: 'curriculo/cv.txt' }) },
    evidenceService: { record: async (input) => ({ path: `evidencias/${input.reference}.png` }) },
    assessmentService: { record: async (input) => ({ result: input }) },
    legacyImportService: { import: async (input) => ({ imported: 2, directory: input.directory }) },
    pendingService: { list: async () => [{ reference: 'app-1' }] },
    checkpointService: { save: async (input) => ({ phase: input.phase }), clear: async () => ({ cleared: true }) },
    metricsService: { get: async () => ({ totals: { applications: 2 } }) }
  });
  const address = await listen(server);
  try {
    const calls = [
      ['POST', '/api/v1/resumes/extract', { path: 'curriculo/cv.pdf' }],
      ['POST', '/api/v1/resumes/select', { jobDescription: 'Node' }],
      ['POST', '/api/v1/jobs/fit', { jobDescription: 'Node' }],
      ['POST', '/api/v1/evidence', { sourcePath: 'estado/x.png', reference: 'app-1' }],
      ['POST', '/api/v1/assessments', { reference: 'app-1', testName: 'Técnico' }],
      ['POST', '/api/v1/imports/legacy', { directory: 'legado' }],
      ['GET', '/api/v1/pending'],
      ['POST', '/api/v1/state/checkpoint', { phase: 'fila' }],
      ['DELETE', '/api/v1/state/checkpoint'],
      ['GET', '/api/v1/metrics']
    ];
    for (const [method, path, body] of calls) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      const expected = ['/api/v1/evidence', '/api/v1/assessments'].includes(path) ? 201 : 200;
      assert.equal(response.status, expected, `${method} ${path}`);
    }
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${address.port}/api/v1/metrics`)).json(), { totals: { applications: 2 } });
  } finally { await close(server); }
});

test('all HTTP mutations honor the Fluxo lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-lock-api-'));
  const release = await acquireFluxoLock(root);
  const server = createServer({ rootDir: root, checkpointService: { save: async () => ({}) } });
  const address = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/state/checkpoint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'fluxo_locked');
  } finally { await close(server); await release(); }
});

test('operations API requests and validates timed-test and message approvals through the composed gateway', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-policy-operations-api-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  const server = createServer({ rootDir: root });
  const address = await listen(server);
  try {
    const run = await responseJson(address, 'POST', '/api/v1/runs', { kind: 'application' });
    const timed = await responseJson(address, 'POST', '/api/v1/assessments/approval', { runId: run.id, payload: { name: 'Lógica', durationSeconds: 900 } });
    const message = await responseJson(address, 'POST', '/api/v1/messages/approval', { runId: run.id, payload: { recipient: 'Pessoa Teste', text: 'Olá, Pessoa Teste.' } });
    await responseJson(address, 'POST', `/api/v1/approvals/${timed.id}/decision`, { decision: 'approved' });
    await responseJson(address, 'POST', `/api/v1/approvals/${message.id}/decision`, { decision: 'approved' });
    const timedAsserted = await responseJson(address, 'POST', `/api/v1/assessments/approval/${timed.id}/assert`, { payload: { name: 'Lógica', durationSeconds: 900 } });
    const messageAsserted = await responseJson(address, 'POST', `/api/v1/messages/approval/${message.id}/assert`, { payload: { recipient: 'Pessoa Teste', text: 'Olá, Pessoa Teste.' } });
    assert.equal(timedAsserted.status, 'approved');
    assert.equal(messageAsserted.status, 'approved');
    for (const [path, payload, browserChallenge] of [
      [`/api/v1/assessments/approval/${timed.id}/assert`, { name: 'Lógica', durationSeconds: 900 }, 'captcha'],
      [`/api/v1/messages/approval/${message.id}/assert`, { recipient: 'Pessoa Teste', text: 'Olá, Pessoa Teste.' }, 'mfa']
    ]) {
      const blocked = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payload, context: { browserChallenge } }) });
      assert.equal(blocked.status, 400, browserChallenge);
      assert.equal((await blocked.json()).error.code, 'manual_intervention_required');
    }
  } finally { await close(server); }
});

async function responseJson(address, method, path, body) {
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.ok, true, `${method} ${path}`);
  return response.json();
}

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
