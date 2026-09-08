import test from 'node:test';
import assert from 'node:assert/strict';
import { createConsistencyService } from '../src/consistency-service.mjs';
import { createAutopilotOrchestrator } from '../src/orchestrator-service.mjs';
import { createCampaignBudget } from '../src/campaign-budget.mjs';

// F5-05 e F3-07: a conta da campanha e o orçamento das tarefas filhas precisam
// existir em caminho real, não só como função pura chamada por teste.

test('a consistência fecha quando candidatura, evidência, evento e contador coincidem', async () => {
  const service = createConsistencyService({
    readState: async () => ({
      queue: { items: [{ id: 'q1', status: 'processada' }] },
      applications: { items: [{ id: 'a1', status: 'enviada', evidencePath: 'evidencias/a1.png', confirmedAt: '2026-09-05T10:00:00.000Z' }], confirmedCount: 1 }
    }),
    readRuns: async () => [{ id: 'r1', submittedCount: 1 }],
    listEvents: () => [{ type: 'application.submission_confirmed' }]
  });

  const relatorio = await service.report();
  assert.equal(relatorio.consistent, true);
  assert.deepEqual(relatorio.divergences, []);
  assert.equal(relatorio.confirmedOnce, 1);
  assert.equal(relatorio.campaignCount, 1);
});

test('execução que contou envio sem candidatura confirmada aparece como divergência', async () => {
  const service = createConsistencyService({
    readState: async () => ({
      queue: { items: [] },
      applications: { items: [], confirmedCount: 0 }
    }),
    readRuns: async () => [{ id: 'r1', submittedCount: 2 }],
    listEvents: () => []
  });

  const relatorio = await service.report();
  assert.equal(relatorio.consistent, false);
  assert.match(relatorio.divergences.join(' '), /contou envio sem candidatura confirmada/);
});

test('candidatura confirmada fora da contagem da campanha aparece como divergência', async () => {
  const service = createConsistencyService({
    readState: async () => ({
      queue: { items: [] },
      applications: { items: [{ id: 'a1', status: 'enviada', evidencePath: 'e.png', confirmedAt: 'agora' }], confirmedCount: 0 }
    }),
    readRuns: async () => [],
    listEvents: () => []
  });

  const relatorio = await service.report();
  assert.equal(relatorio.consistent, false);
  assert.match(relatorio.divergences.join(' '), /não entrou na contagem/);
});

test('a tarefa filha recebe orçamento derivado e o cancelamento da campanha chega nela', async () => {
  const eventos = [];
  const orcamentos = [];
  const budget = createCampaignBudget({ config: { maxApplicationsPerRun: 5, maxConsecutiveFailures: 3 } });
  const runService = {
    startRun: () => ({ id: 'run-1', kind: 'autopilot' }),
    getRun: () => ({ id: 'run-1', status: 'running' }),
    appendEvent: (evento) => { eventos.push(evento); return evento; },
    setPlan: () => {}, saveWorkflow: () => {}, getWorkflow: () => null, recordTask: () => {},
    finishRun: (id, status) => ({ id, status }), listRuns: () => [{ id: 'run-1' }]
  };
  const agente = {
    async run(context) {
      orcamentos.push(context.budget);
      return { status: 'succeeded', confirmed: true, result: {}, observation: 'ok' };
    }
  };
  const orchestrator = createAutopilotOrchestrator({
    runService,
    budget,
    agents: { intake: agente, discovery: agente, fit: agente, application: agente, followup: agente }
  });

  const inicio = await orchestrator.start({ objective: 'testar orçamento', input: { goalsMet: true, explicitClose: true } });
  await inicio.completion;

  assert.equal(orcamentos.length, 5, 'cada tarefa precisa receber o próprio orçamento');
  assert.ok(orcamentos.every((item) => typeof item?.assertCanAct === 'function'));
  // O estado é compartilhado: cancelar a campanha barra a tarefa filha na hora.
  budget.cancel();
  assert.throws(() => orcamentos[0].assertCanAct('external'), { code: 'campaign_cancelled' });
});

test('limite de candidaturas da campanha interrompe a tarefa filha', async () => {
  const budget = createCampaignBudget({ config: { maxApplicationsPerRun: 1 } });
  const filho = budget.childBudget();
  budget.recordSubmission();
  assert.throws(() => filho.assertCanAct('external'), { code: 'run_application_limit_reached' });
  assert.equal(filho.assertCanAct('read'), true, 'leitura continua permitida após o limite de envios');
});
