import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalRuntime } from '../src/runtime.mjs';
import { createAutopilotOrchestrator } from '../src/orchestrator-service.mjs';
import { createRunService } from '../src/run-service.mjs';
import { applyCampaignFilters } from '../src/campaign-filters.mjs';
import { createCampaignBudget } from '../src/campaign-budget.mjs';
import { createPersistenceAuthority } from '../src/persistence-authority.mjs';

test('new roots use SQLite authority and do not treat JSON as a parallel source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-sqlite-root-'));
  const runtime = await createLocalRuntime({ rootDir: root });
  try {
    assert.equal(await runtime.persistence.isSqliteAuthority(), true);
    assert.equal(await runtime.persistence.getMode(), 'sqlite');
  } finally { await runtime.close(); }
});

test('production packages must not auto-select fixture mode', async () => {
  const { createAutopilotService } = await import('../src/autopilot-service.mjs');
  let used;
  const service = createAutopilotService({
    productionOrchestrator: { async start(input) { used = input.mode; return { run: { id: 'r', mode: input.mode }, status: 'running' }; } },
    orchestrator: { async start() { used = 'fixture'; return { run: { id: 'f', mode: 'fixture' }, status: 'running' }; } },
    runService: { startRun() { throw new Error('não deve criar run avulso'); } }
  });
  const started = await service.start({ intent: 'Backend' });
  assert.equal(used, 'autonomous');
  assert.equal(started.run.mode, 'autonomous');
});

// F8-05: campanha controlada de 20 oportunidades, interrompida de verdade em três
// fronteiras diferentes, com o serviço de execução reaberto a cada interrupção.
// O teste anterior só simulava o laço em memória e não retomava nada.
test('controlled campaign of 20 opportunities survives interruption at three boundaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-20-'));
  const dbPath = join(root, 'harness.sqlite');
  const opportunities = Array.from({ length: 20 }, (_, index) => ({
    id: `job-${index + 1}`,
    role: index % 5 === 0 ? 'Estágio' : 'Backend',
    company: index % 7 === 0 ? 'Acme' : `Empresa ${index}`,
    location: 'Remoto',
    workMode: 'Remoto',
    identifierOrUrl: index % 7 === 0 ? 'https://gupy.io/jobs/acme' : `https://gupy.io/jobs/${index + 1}`
  }));

  const filters = { roles: ['Backend'], exclusions: ['Estágio'] };
  const eligible = opportunities.filter((item) => applyCampaignFilters(item, filters, { skills: { value: ['Node.js'], confirmed: true } }).eligible);
  const unique = [...new Map(eligible.map((item) => [`${item.company}|${item.role}|${item.identifierOrUrl}`, item])).values()];
  assert.ok(eligible.length < opportunities.length, 'exclusões precisam remover parte das oportunidades');
  assert.ok(unique.length < eligible.length, 'duplicata por empresa+cargo+URL precisa ser descartada');

  const budget = createCampaignBudget({ config: { maxApplicationsPerRun: 20, maxConsecutiveFailures: 5 } });
  const enviados = [];
  // Interrompe em três fronteiras: antes da busca, antes da revisão e antes do acompanhamento.
  const interrupcoes = ['discovery', 'application', 'followup'];
  let pararEm = interrupcoes.shift();
  let runId = '';

  for (let volta = 0; volta < 4; volta += 1) {
    // Cada volta reabre o serviço no mesmo banco: nada pode viver só em memória.
    const runService = createRunService({ dbPath });
    try {
      const agents = Object.fromEntries(['intake', 'discovery', 'fit', 'application', 'followup'].map((name) => [name, {
        async run(context) {
          if (name === pararEm) {
            const erro = new Error(`interrupção controlada em ${name}`);
            erro.code = 'interrupcao_de_teste';
            throw erro;
          }
          if (name === 'application') {
            for (const item of unique) {
              context.budget.assertCanAct('external');
              if (enviados.includes(item.id)) continue;
              enviados.push(item.id);
              context.budget.recordSubmission();
            }
          }
          return { confirmed: true, result: { name, prepared: unique.length } };
        }
      }]));
      const orchestrator = createAutopilotOrchestrator({ runService, budget, agents, maxRetries: 0 });

      if (!runId) {
        const inicio = await orchestrator.start({ objective: 'campanha-20', input: { goalsMet: true, explicitClose: true } });
        runId = inicio.run.id;
        await inicio.completion;
      } else {
        await orchestrator.continue(runId, {});
      }

      const tarefas = runService.listSubtasks(runId);
      assert.equal(tarefas.length, 5, 'as cinco tarefas ficam persistidas no banco');
      assert.deepEqual(tarefas[1].dependsOn, ['intake'], 'a dependência entre etapas é persistida');

      if (pararEm) {
        const travada = tarefas.find((item) => item.parentTask === pararEm);
        assert.equal(travada.status, 'needs_attention', `${pararEm} precisa ficar registrada como pendente`);
        assert.ok(travada.attempts >= 1, 'a tentativa precisa ser persistida, não só contada em memória');
        // As etapas anteriores continuam concluídas: retomar não refaz a jornada.
        for (const anterior of tarefas.slice(0, tarefas.indexOf(travada))) {
          assert.equal(anterior.status, 'succeeded', `${anterior.parentTask} não deveria voltar para trás`);
        }
        pararEm = interrupcoes.shift();
      } else {
        assert.equal(tarefas.every((item) => item.status === 'succeeded'), true, 'a jornada retomada precisa fechar todas as etapas');
        assert.deepEqual(runService.readySubtasks(runId), [], 'nenhuma tarefa fica pendente ao final');
      }
    } finally {
      runService.close();
    }
  }

  assert.equal(enviados.length, unique.length, 'cada oportunidade elegível é enviada exatamente uma vez');
  assert.equal(new Set(enviados).size, enviados.length, 'nenhuma oportunidade é enviada duas vezes após as retomadas');
  assert.equal(budget.snapshot().submitted, unique.length, 'o contador da campanha precisa bater com os envios');

  // Cancelar a campanha depois das retomadas barra qualquer nova ação externa.
  const runService = createRunService({ dbPath });
  try {
    const orchestrator = createAutopilotOrchestrator({
      runService,
      budget,
      agents: Object.fromEntries(['intake', 'discovery', 'fit', 'application', 'followup'].map((name) => [name, { async run() { return { confirmed: true, result: { name } }; } }]))
    });
    assert.equal(orchestrator.cancel(runId).cancelled, true);
    assert.throws(() => budget.childBudget().assertCanAct('external'), { code: 'campaign_cancelled' });
  } finally {
    runService.close();
  }
});

test('legacy JSON root still requires explicit migration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-legacy-mig-'));
  await mkdir(join(root, 'campanha'), { recursive: true });
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ platforms: [] }));
  const persistence = createPersistenceAuthority({ rootDir: root });
  try {
    assert.equal(await persistence.isSqliteAuthority(), false);
    await assert.rejects(persistence.initializeNew(), { code: 'legacy_data_exists' });
  } finally { persistence.close(); }
});
