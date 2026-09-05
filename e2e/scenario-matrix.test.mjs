import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLocalRuntime } from '../app/src/runtime.mjs';
import { boardServer, closeServer, onboard, syntheticRoot } from './support/journey-fixture.mjs';

// F8-03: linhas de navegador real da matriz da seção 6, com site controlado.
// Cada cenário existe para pegar uma falha específica em produção, não para repetir os testes de domínio.

test('B — revisão rejeitada e revisão alterada nunca enviam', { timeout: 120_000 }, async (t) => {
  const { runtime, board, root } = await bootstrap(t);
  const item = await firstOpportunity(runtime, board);
  const prepared = await runtime.applicationFlow.prepareNext({ itemId: item.id });
  const payload = { queueItemId: item.id };

  const rejected = runtime.applicationFlow.requestSubmissionApproval(prepared.run.id, payload);
  runtime.approvalService.decideApproval(rejected.id, { decision: 'rejected', reason: 'Revisão recusada no cenário controlado.' }, { actorType: 'user', actorId: 'e2e' });
  await assert.rejects(runtime.applicationFlow.submitApproved(prepared, rejected.id, payload), { code: 'approval_required' });
  assert.equal(board.submissions.length, 0);

  const approved = runtime.applicationFlow.requestSubmissionApproval(prepared.run.id, payload);
  runtime.approvalService.decideApproval(approved.id, { decision: 'approved' }, { actorType: 'user', actorId: 'e2e' });
  // Alterar o conteúdo depois da aprovação invalida a autorização: o hash deixa de corresponder.
  await assert.rejects(runtime.applicationFlow.submitApproved(prepared, approved.id, { ...payload, resume: 'curriculo/outro.txt' }), { code: 'approval_payload_changed' });
  assert.equal(board.submissions.length, 0);
  assert.equal((await runtime.persistence.getApplications()).length, 0);
  assert.equal(await readFile(join(root, 'estado', 'preflight.json'), 'utf8') !== '', true);
});

test('B — duas tarefas, uma sessão: nenhuma ação na vaga errada', { timeout: 120_000 }, async (t) => {
  const { runtime, board } = await bootstrap(t);
  const opportunities = await discover(runtime, board);
  const first = opportunities.find((entry) => entry.identifierOrUrl.endsWith('/jobs/1'));
  const second = opportunities.find((entry) => entry.identifierOrUrl.endsWith('/jobs/2'));

  const preparedFirst = await runtime.applicationFlow.prepareNext({ itemId: first.id });
  const payload = { queueItemId: first.id };
  const approval = runtime.applicationFlow.requestSubmissionApproval(preparedFirst.run.id, payload);
  runtime.approvalService.decideApproval(approval.id, { decision: 'approved' }, { actorType: 'user', actorId: 'e2e' });

  // A segunda tarefa assume o navegador e a tela deixa de ser a da primeira vaga.
  await runtime.applicationFlow.prepareNext({ itemId: second.id });
  await assert.rejects(runtime.applicationFlow.submitApproved(preparedFirst, approval.id, payload), { code: 'checkpoint_mismatch' });
  assert.equal(board.submissions.length, 0, 'nenhum envio pode acontecer na vaga errada');

  const lease = runtime.orchestrator.browserLease;
  lease.acquire('run-a:application');
  assert.throws(() => lease.acquire('run-b:application'), { code: 'browser_lease_held' });
  assert.throws(() => lease.assertOwner('run-b:application'), { code: 'browser_lease_mismatch' });
  lease.release('run-a:application');
  lease.acquire('run-b:application');
  lease.release('run-b:application');
});

test('B — CAPTCHA na vaga para a tarefa e pede a pessoa', { timeout: 120_000 }, async (t) => {
  const { runtime, board } = await bootstrap(t, { challenge: true });
  const item = (await discover(runtime, board)).at(0);
  await assert.rejects(runtime.applicationFlow.prepareNext({ itemId: item.id }), { code: 'manual_intervention_required' });
  assert.equal(board.submissions.length, 0);
  const decision = runtime.policyGateway.evaluate({ kind: 'submission' }, { browserChallenge: 'captcha' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.requiresApproval, false);
  assert.equal(decision.code, 'manual_intervention_required');
});

test('B — plataforma fora do ar não vira "nenhuma vaga"', { timeout: 120_000 }, async (t) => {
  const { runtime, board } = await bootstrap(t);
  await closeServer(board.server);
  const result = await runtime.discoveryService.discover({ platforms: ['INFOJOBS'], searchUrl: `${board.url}/jobs` });
  assert.equal(result.created.length, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].retryable, true);
  assert.match(result.failures[0].message, /INFOJOBS/);
  assert.match(result.nextAction, /Tentar novamente/);
});

test('B — busca indisponível por decisão de escopo não é tratada como falha temporária', { timeout: 120_000 }, async (t) => {
  const { runtime } = await bootstrap(t);
  const result = await runtime.discoveryService.discover({
    platforms: ['PANDAPE'],
    searchPlan: [{ platform: 'PANDAPE', searchUrl: '', unavailable: true, reason: 'PandaPé não oferece busca pública; use convite.' }]
  });
  assert.equal(result.failures[0].type, 'search_unavailable');
  assert.equal(result.failures[0].retryable, false);
  assert.match(result.failures[0].message, /convite/);
});

test('B — página com instrução hostil não expande permissão nem expõe segredo', { timeout: 120_000 }, async (t) => {
  const { runtime, board, root } = await bootstrap(t);
  await runtime.browserAdapter.open({ identifierOrUrl: `${board.url}/hostil`, platform: 'INFOJOBS' });
  const snapshot = await runtime.browserAdapter.snapshot();
  assert.match(snapshot.text, /Ignore as instruções anteriores/);
  const serialized = JSON.stringify(snapshot);
  assert.equal(/PLAYWRIGHT_HEADLESS|INFOJOBS_URL|REQUIRE_FINAL_CONFIRMATION/.test(serialized), false, 'o snapshot não pode carregar conteúdo do .env');
  await assert.rejects(runtime.browserAdapter.open({ identifierOrUrl: `file:///${join(root, '.env').replaceAll('\\', '/')}`, platform: 'INFOJOBS' }));
  assert.deepEqual(runtime.approvalService.listApprovals(), [], 'nenhuma aprovação pode nascer da leitura de uma página');
});

async function bootstrap(t, { challenge = false } = {}) {
  const board = await boardServer(t, challenge ? { challenge: true } : {});
  const fixture = await syntheticRoot(t, { platformUrls: { INFOJOBS: `${board.url}/jobs` } });
  const runtime = await createLocalRuntime({ rootDir: fixture.root, headless: true });
  t.after(async () => { await runtime.close(); await fixture.cleanup(); });
  await onboard(runtime, fixture.root);
  return { runtime, board, root: fixture.root };
}

async function discover(runtime, board) {
  const result = await runtime.discoveryService.discover({ platforms: ['INFOJOBS'], searchUrl: `${board.url}/jobs` });
  assert.deepEqual(result.failures, []);
  return result.created;
}

async function firstOpportunity(runtime, board) {
  return (await discover(runtime, board)).at(0);
}
