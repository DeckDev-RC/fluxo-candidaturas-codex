import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryService } from '../src/memory-service.mjs';
import { createIntakeService } from '../src/intake-service.mjs';
import { createDiscoveryService } from '../src/discovery-service.mjs';
import { createFitService } from '../src/fit-service.mjs';
import { createQueueService } from '../src/queue-service.mjs';
import { createRunService } from '../src/run-service.mjs';
import { createApprovalService } from '../src/approval-service.mjs';
import { createApplicationFlow } from '../src/application-flow.mjs';
import { createExceptionService } from '../src/exception-service.mjs';
import { createFollowUpMonitor } from '../src/follow-up-monitor.mjs';
import { createAuditService } from '../src/audit-service.mjs';

test('fixture E2E covers intake, discovery, shortlist, browser application, exception, restart and follow-up', async () => {
  const root = await fixtureRoot();
  const memory = createMemoryService({ rootDir: root, mutationLock: false });
  const intake = createIntakeService({ rootDir: root, memoryService: memory });
  const preview = await intake.preview({ source: 'curriculo/cv.txt', text: 'Nome: Pessoa Teste\nE-mail: ana@example.com\nTelefone: 000\nLocalização: Remoto\nCargo-alvo: Backend\nCompetências: Node.js, SQL' });
  await intake.commit({ preview, corrections: {} });
  const queue = createQueueService({ rootDir: root, mutationLock: false });
  const discovery = createDiscoveryService({ rootDir: root, queueService: queue, adapters: { GUPY: { async search() { return [{ id: 'job-e2e', title: 'Backend', company: 'Acme', url: 'fixture://job-e2e', requirements: ['Node.js'] }]; } } }, mutationLock: false });
  const found = await discovery.discover({ platforms: ['GUPY'], roles: ['Backend'] });
  const shortlist = createFitService().shortlist({ opportunities: found.created, facts: (await memory.get()).facts });
  assert.equal(shortlist.items[0].fit.classification, 'forte');

  const dbPath = join(root, 'estado', 'harness.sqlite');
  const runs = createRunService({ dbPath });
  const approvals = createApprovalService({ dbPath });
  const flow = createApplicationFlow({ queueService: queue, runService: runs, approvalService: approvals, browserAdapter: { async snapshot() { return { url: 'https://fixture.test/form', dom: { fields: ['name'] } }; }, async fillConfirmed() { return { url: 'https://fixture.test/form' }; }, async submitWithRetry() { return { confirmed: true, state: { text: 'Candidatura enviada' } }; }, async captureEvidence() { return 'evidencias/app-e2e.png'; } }, evidenceMode: 'confirmation', async recordApplication() { return { id: 'app-e2e', status: 'enviada' }; } });
  const prepared = await flow.prepareNext({ itemId: shortlist.items[0].id });
  await flow.fillConfirmed(prepared, { name: { value: 'Pessoa Teste', confirmed: true } });
  const approval = flow.requestSubmissionApproval(prepared.run.id, { queueItemId: prepared.item.id, fields: { name: 'Pessoa Teste' } });
  approvals.decideApproval(approval.id, { decision: 'approved', actorId: 'e2e' });
  const submitted = await flow.submitApproved(prepared, approval.id, { queueItemId: prepared.item.id, fields: { name: 'Pessoa Teste' } });
  assert.equal(submitted.confirmation.confirmed, true);

  const exceptions = createExceptionService({ rootDir: root, runService: runs, mutationLock: false });
  const opened = await exceptions.create({ runId: prepared.run.id, type: 'missing_data', field: 'horário da entrevista' });
  await exceptions.respond(opened.id, { response: 'Horário confirmado' });
  runs.close(); approvals.close();
  const restarted = createRunService({ dbPath });
  assert.equal(restarted.getRun(prepared.run.id).status, 'running');
  const monitor = createFollowUpMonitor({ rootDir: root, adapters: { GUPY: { async status() { return [{ id: 'interview-e2e', type: 'entrevista', status: 'convite', nextAction: 'Confirmar horário' }]; } } } });
  const followed = await monitor.check({ applications: [{ id: 'app-e2e', platform: 'GUPY', company: 'Acme', role: 'Backend' }] });
  assert.equal(followed.alerts.length, 1);
  const audit = createAuditService({ rootDir: root });
  await audit.record({ runId: prepared.run.id, task: 'application', result: { confirmed: true }, confidence: 'alta' });
  assert.equal((await audit.exportPackage({ runId: prepared.run.id })).entries, 1);
  restarted.close();
});

async function fixtureRoot() { const root = await mkdtemp(join(tmpdir(), 'fluxo-full-e2e-')); for (const dir of ['estado', 'config', 'campanha', 'fila', 'candidaturas', 'curriculo', 'evidencias']) await mkdir(join(root, dir), { recursive: true }); await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ platforms: [{ name: 'GUPY', enabled: true, goal: 1 }] })); await writeFile(join(root, 'fila', 'vagas.json'), '[]'); await writeFile(join(root, 'candidaturas', 'candidaturas.json'), '[]'); return root; }
