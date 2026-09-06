import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryService } from '../src/memory-service.mjs';
import { createIntakeService } from '../src/intake-service.mjs';
import { createDomainTools } from '../src/domain-tools.mjs';
import { createCampaignBudget } from '../src/campaign-budget.mjs';
import { createRunService } from '../src/run-service.mjs';

// Correções vindas da auditoria das marcações do checklist funcional.

async function memoria() {
  const raiz = await mkdtemp(join(tmpdir(), 'fluxo-auditoria-'));
  return { raiz, service: createMemoryService({ rootDir: raiz, mutationLock: false }) };
}

test('F1-03 — divergência entre currículos é registrada em vez de descartada', async () => {
  const { raiz, service } = await memoria();
  const intake = createIntakeService({ rootDir: raiz, memoryService: service });

  const preview = await intake.preview({
    documents: [
      { path: 'curriculo/antigo.txt', text: 'Nome: Pessoa Exemplo\nE-mail: ana@example.test\nTelefone: 11900000000\nLocalização: São Paulo\nCargos-alvo: Backend' },
      { path: 'curriculo/novo.txt', text: 'Nome: Pessoa Exemplo Silva\nE-mail: ana@example.test\nTelefone: 11900000000\nLocalização: São Paulo\nCargos-alvo: Backend' }
    ]
  });

  assert.equal(preview.conflicts.length, 1, 'o nome divergente precisa virar conflito');
  assert.equal(preview.conflicts[0].key, 'name');
  assert.equal(preview.ready, false, 'com divergência aberta o perfil não é anunciado como pronto');
  const guardados = (await service.safeSummary()).conflicts;
  assert.equal(guardados.length, 1, 'o conflito precisa sobreviver na memória para a pessoa decidir');
});

test('F1-03 — resolver a divergência grava a escolha e fecha o conflito', async () => {
  const { service } = await memoria();
  await service.upsertFacts([{ key: 'location', value: 'São Paulo', confirmed: true, source: 'currículo' }]);
  await service.recordConflicts([{ key: 'location', previous: 'São Paulo', incoming: 'Belo Horizonte' }]);
  assert.equal((await service.safeSummary()).conflicts.length, 1);

  await service.resolveConflict('location', 'Belo Horizonte');
  const resumo = await service.safeSummary();
  assert.deepEqual(resumo.conflicts, [], 'o conflito resolvido sai da lista');
  assert.equal(resumo.facts.location.value, 'Belo Horizonte');
  assert.equal(resumo.facts.location.confirmed, true);
  assert.match(resumo.facts.location.source, /Decisão do usuário/, 'a origem precisa dizer que foi decisão da pessoa');
});

test('F1-03 — remover um fato também limpa a divergência pendente dele', async () => {
  const { service } = await memoria();
  await service.upsertFacts([{ key: 'phone', value: '11900000000', confirmed: true }]);
  await service.recordConflicts([{ key: 'phone', previous: '11900000000', incoming: '11777776666' }]);
  await service.removeFact('phone');
  assert.deepEqual((await service.safeSummary()).conflicts, []);
});

test('F2-05 — ferramenta de domínio não fura o limite da campanha', async () => {
  const raiz = await mkdtemp(join(tmpdir(), 'fluxo-tools-budget-'));
  const runService = createRunService({ dbPath: join(raiz, 'harness.sqlite') });
  const run = runService.startRun({ kind: 'autopilot' });
  const budget = createCampaignBudget({ config: { maxApplicationsPerRun: 1 } });
  let buscas = 0;

  const tools = createDomainTools({
    rootDir: '',
    runService,
    budget,
    readState: async () => ({ installation: { ready: true }, campaign: { platforms: [{ name: 'INFOJOBS', enabled: true }] }, queue: { items: [] } }),
    discoveryService: { async discover() { buscas += 1; return { created: [], failures: [] }; } },
    memoryService: { async safeSummary() { return { facts: {} }; } },
    followUpMonitor: { async check() { return { newEvents: [] }; } }
  });

  try {
    await tools.call('fluxo_discover', { searchUrl: 'https://example.test/jobs', platform: 'INFOJOBS' }, run.id);
    assert.equal(buscas, 1);

    budget.recordSubmission();
    await assert.rejects(
      tools.call('fluxo_discover', { searchUrl: 'https://example.test/jobs', platform: 'INFOJOBS' }, run.id),
      { code: 'run_application_limit_reached' }
    );
    assert.equal(buscas, 1, 'a ferramenta não pode agir depois do limite');

    // Leitura de acompanhamento continua permitida; cancelar a campanha barra até ela.
    await tools.call('fluxo_followup', {}, run.id);
    budget.cancel();
    await assert.rejects(tools.call('fluxo_followup', {}, run.id), { code: 'campaign_cancelled' });
  } finally {
    runService.close();
  }
});

test('F3-03 — tarefas guardam dependência, tentativas e prontidão para retomar', async () => {
  const raiz = await mkdtemp(join(tmpdir(), 'fluxo-subtarefas-'));
  const dbPath = join(raiz, 'harness.sqlite');
  let runId = '';

  const primeiro = createRunService({ dbPath });
  try {
    const run = primeiro.startRun({ kind: 'autopilot' });
    runId = run.id;
    primeiro.addSubtask(run.id, { id: `${run.id}:intake`, parentTask: 'intake', status: 'succeeded' });
    primeiro.addSubtask(run.id, { id: `${run.id}:discovery`, parentTask: 'discovery', status: 'pending', dependsOn: ['intake'] });
    primeiro.addSubtask(run.id, { id: `${run.id}:fit`, parentTask: 'fit', status: 'pending', dependsOn: ['discovery'] });
    primeiro.updateSubtask(`${run.id}:discovery`, { incrementAttempts: true, status: 'needs_attention' });
  } finally { primeiro.close(); }

  // Serviço reaberto: o que já estava pronto continua pronto.
  const segundo = createRunService({ dbPath });
  try {
    const tarefas = segundo.listSubtasks(runId);
    assert.equal(tarefas.length, 3);
    assert.equal(tarefas[0].status, 'succeeded');
    assert.deepEqual(tarefas[1].dependsOn, ['intake']);
    assert.equal(tarefas[1].attempts, 1, 'a tentativa precisa estar persistida');
    const prontas = segundo.readySubtasks(runId).map((item) => item.parentTask);
    assert.deepEqual(prontas, ['discovery'], 'fit só fica pronta depois que discovery terminar');

    segundo.updateSubtask(`${runId}:discovery`, { status: 'succeeded' });
    assert.deepEqual(segundo.readySubtasks(runId).map((item) => item.parentTask), ['fit']);
  } finally { segundo.close(); }
});
