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

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
