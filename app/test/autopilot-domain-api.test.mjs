import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';
import { createMemoryService } from '../src/memory-service.mjs';
import { createIntakeService } from '../src/intake-service.mjs';
import { createDiscoveryService } from '../src/discovery-service.mjs';
import { createFitService } from '../src/fit-service.mjs';
import { createExceptionService } from '../src/exception-service.mjs';
import { createFollowUpMonitor } from '../src/follow-up-monitor.mjs';

test('domain APIs expose memory, intake, discovery, fit, exception and follow-up flows locally', async () => {
  const root = await fixtureRoot();
  const memoryService = createMemoryService({ rootDir: root });
  const intakeService = createIntakeService({ rootDir: root, memoryService });
  const discoveryService = createDiscoveryService({ rootDir: root, queueService: { async addQueueItem(item) { return item; } }, adapters: { GUPY: { async search() { return [{ id: 'j1', title: 'Backend', company: 'Acme', url: 'https://gupy/job/1', requirements: ['Node.js'] }]; } } }, mutationLock: false });
  const exceptionService = createExceptionService({ rootDir: root, mutationLock: false });
  const server = createServer({ rootDir: root, requireSession: false, memoryService, intakeService, discoveryService, fitService: createFitService(), exceptionService, followUpMonitor: createFollowUpMonitor({ rootDir: root, adapters: {} }) });
  const address = await listen(server);
  try {
    const preview = await post(address, '/api/v1/intake/preview', { text: 'Nome: Pessoa Teste\nE-mail: ana@example.com\nTelefone: 000\nLocalização: Remoto\nCargo-alvo: Backend' });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.ready, true);
    assert.equal((await post(address, '/api/v1/intake/commit', { preview: preview.body, corrections: {} })).status, 200);
    const memory = await fetch(`http://127.0.0.1:${address.port}/api/v1/memory`);
    assert.equal((await memory.json()).facts.name.value, 'Pessoa Teste');
    assert.equal((await post(address, '/api/v1/discovery', { platforms: ['GUPY'] })).status, 200);
    assert.equal((await post(address, '/api/v1/fit', { opportunities: [{ id: 'j1', requirements: ['Node.js'] }], facts: { skills: { value: ['Node.js'] } } })).body.items[0].fit.classification, 'forte');
    const exception = await post(address, '/api/v1/exceptions', { runId: 'run-1', type: 'missing_data', field: 'telefone' });
    assert.equal(exception.status, 201);
    assert.equal((await post(address, `/api/v1/exceptions/${exception.body.id}/respond`, { response: 'Informado' })).status, 200);
  } finally { await close(server); }
});

async function fixtureRoot() { const root = await mkdtemp(join(tmpdir(), 'fluxo-domain-api-')); await mkdir(join(root, 'estado'), { recursive: true }); return root; }
async function post(address, path, body) { const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; }
function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
