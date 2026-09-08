import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserAdapter } from '../src/browser-adapter.mjs';
import { createAuditService } from '../src/audit-service.mjs';

test('browser adapter interprets DOM/text/visual state and fills only confirmed facts after re-observing', async () => {
  const actions = []; let snapshot = 0;
  const adapter = createBrowserAdapter({ driver: {
    async snapshot() { snapshot += 1; return { url: 'https://example.test/form', page: 'application-form', text: 'Nome E-mail', dom: { fields: ['name', 'email'] }, screenshot: 'visual-hash' }; },
    async fill(field, value) { actions.push([field, value]); }
  } });
  const observed = await adapter.observeForm();
  assert.deepEqual(observed.fields, ['name', 'email']);
  await adapter.fillConfirmed({ name: { value: 'Pessoa Teste', confirmed: true }, email: { value: 'ana@example.com', confirmed: false }, unknown: { value: 'x', confirmed: true } });
  assert.deepEqual(actions, [['name', 'Pessoa Teste']]);
  assert.equal(snapshot, 2);
});

test('browser adapter retries a recoverable mutation only until confirmation and never submits twice', async () => {
  let submissions = 0; let checks = 0;
  const adapter = createBrowserAdapter({ driver: {
    async snapshot() { return { text: 'form' }; },
    async click() { submissions += 1; if (submissions === 1) throw Object.assign(new Error('timeout'), { retryable: true }); },
    async state() { checks += 1; return { text: checks > 1 ? 'Candidatura enviada' : 'form' }; }
  } });
  const result = await adapter.submitWithRetry('submit', { maxAttempts: 2 });
  assert.equal(result.confirmed, true);
  assert.equal(submissions, 1);
});

test('audit service stores sanitized trace entries, confidence and a shareable package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-audit-')); await mkdir(join(root, 'evidencias'), { recursive: true });
  const audit = createAuditService({ rootDir: root, now: () => new Date('2026-09-04T12:00:00.000Z') });
  const entry = await audit.record({ runId: 'run-1', task: 'application', tool: 'playwright', observation: { url: 'https://example.test', text: 'enviada', cookie: 'secret' }, result: { confirmed: true, token: 'secret' }, confidence: 'alta', reason: 'Texto de confirmação observado', beforeHash: 'before', afterHash: 'after' });
  assert.match(entry.hash, /^[0-9a-f]{64}$/);
  assert.equal('cookie' in entry.observation, false);
  const exported = await audit.exportPackage({ runId: 'run-1' });
  assert.equal(exported.path, 'evidencias/auditoria-run-1.json');
  assert.match(exported.sha256, /^[0-9a-f]{64}$/);
  assert.equal((await audit.list('run-1')).length, 1);
});
