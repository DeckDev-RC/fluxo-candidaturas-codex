import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuditService } from '../src/audit-service.mjs';
import { createServer } from '../src/http-server.mjs';

test('audit API reads a run trace and exports a sanitized package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-audit-api-'));
  const audit = createAuditService({ rootDir: root });
  await audit.record({ runId: 'run-api', task: 'fit', observation: { text: 'ok' }, result: { score: 90 }, confidence: 'alta' });
  const server = createServer({ rootDir: root, requireSession: false, auditService: audit });
  const address = await listen(server);
  try {
    const read = await fetch(`http://127.0.0.1:${address.port}/api/v1/audit/run-api`);
    assert.equal(read.status, 200);
    assert.equal((await read.json()).length, 1);
    const exported = await fetch(`http://127.0.0.1:${address.port}/api/v1/audit/run-api/export`, { method: 'POST' });
    assert.equal(exported.status, 200);
    assert.equal((await exported.json()).path, 'evidencias/auditoria-run-api.json');
  } finally { await close(server); }
});

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
