import { mkdtemp, mkdir, access, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('HTTP mutations persist operation lifecycle and response envelope', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-mutation-api-')); await mkdir(join(root, 'estado'), { recursive: true });
  const operations = [];
  const server = createServer({ rootDir: root, stateStore: { startOperation(input) { const operation = { id: 'op-1', ...input }; operations.push(operation); return operation; }, updateOperation(id, patch) { Object.assign(operations.find((item) => item.id === id), patch); }, close() {} } });
  const address = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'campaign' }) });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(operations[0].status, 'succeeded');
    assert.equal(body.request_id, response.headers.get('x-request-id'));
    assert.deepEqual(body.event_ids, []);
    assert.ok(body.state);
  } finally { await close(server); }
});

test('HTTP JSON mutation keeps a recoverable backup and final hash', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-mutation-backup-'));
  for (const directory of ['estado', 'fila', 'candidaturas', 'campanha']) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, 'fila', 'vagas.json'), '[]'); await writeFile(join(root, 'candidaturas', 'candidaturas.json'), '[]'); await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ platforms: [{ name: 'GUPY', enabled: true, goal: 1 }] }));
  const server = createServer({ rootDir: root }); const address = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/queue/items`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ platform: 'GUPY', company: 'Acme', role: 'Dev', identifierOrUrl: '1' }) });
    assert.equal(response.status, 201);
    await access(join(root, 'fila', 'vagas.json.bak'));
    const operations = await (await fetch(`http://127.0.0.1:${address.port}/api/v1/operations`)).json();
    assert.match(operations[0].beforeHash, /^[0-9a-f]{64}$/); assert.match(operations[0].afterHash, /^[0-9a-f]{64}$/);
  } finally { await close(server); }
});

test('HTTP mutation rejects an aggregate already awaiting reconciliation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-mutation-blocked-')); await mkdir(join(root, 'estado'), { recursive: true });
  const server = createServer({ rootDir: root, stateStore: { isAggregateBlocked: () => true, startOperation() { throw new Error('must not start'); }, updateOperation() {}, close() {} } });
  const address = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'blocked' }) });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'aggregate_blocked');
  } finally { await close(server); }
});

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
