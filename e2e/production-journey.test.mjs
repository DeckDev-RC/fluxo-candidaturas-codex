import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createLocalRuntime } from '../app/src/runtime.mjs';
import { createServer } from '../app/src/http-server.mjs';
import { readFluxoState } from '../app/src/state-reader.mjs';
import { artifacts, boardServer, closeServer, listen, onboard, resumeFileWithoutRole, syntheticRoot } from './support/journey-fixture.mjs';

// F8-02: a jornada de produção conduzida pela UI, com especialistas reais e Chromium real.
// Pega delegação falsa (identidade fixture), pausa que não chega à interface, lacuna
// perguntada de novo, busca que ignora a plataforma configurada e envio sem revisão aprovada.
test('F8-02 jornada pela UI: objetivo, lacuna respondida, busca real e envio aprovado', { timeout: 240_000 }, async (t) => {
  const board = await boardServer(t);
  const fixture = await syntheticRoot(t, { platformUrls: { INFOJOBS: `${board.url}/jobs` } });
  const runtime = await createLocalRuntime({ rootDir: fixture.root, headless: true });
  t.after(async () => { await runtime.close(); await fixture.cleanup(); });
  await onboard(runtime, fixture.root);

  const app = await appServer(runtime, fixture.root);
  t.after(async () => { await closeServer(app); });
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const observed = observe(page);
  const resumePath = await resumeFileWithoutRole(t);

  try {
    await journey({ page, runtime, fixture, board, url: app.url, resumePath });
  } catch (error) {
    await report(page, runtime, observed);
    throw error;
  }
  assert.deepEqual(observed.errors, []);
});

async function journey({ page, runtime, fixture, board, url, resumePath }) {
  await page.goto(url);
  // A tela Agora reconhece que está tudo confirmado e oferece iniciar a busca.
  await page.getByRole('button', { name: 'Procurar vagas agora' }).click();
  await page.locator('#objetivo').fill('conduzir candidaturas de engenharia de software remotas');
  await page.locator('#curriculo').setInputFiles(resumePath);
  // Transferência, verificação e leitura são etapas distintas: espero a leitura terminar.
  await page.locator('#documento-etapas span:nth-child(3)[data-estado="feito"]').waitFor({ timeout: 60_000 });
  await page.getByText(/Verificação do arquivo/).waitFor({ timeout: 30_000 });
  const imported = await readFile(join(fixture.root, 'curriculo', 'curriculo-sintetico.txt'), 'utf8');
  assert.match(imported, /fixture@example\.test/, 'o conteúdo do arquivo externo precisa ter sido transferido');
  await page.locator('#comecar').click();

  // O currículo importado não declara localização: o Intake precisa parar e perguntar.
  await page.locator('#lista-decisoes').waitFor({ timeout: 60_000 });
  await page.screenshot({ path: join(artifacts, 'ui-lacuna.png'), fullPage: true });
  assert.match(await page.locator('#indicador-decisoes-texto').textContent(), /decis/i);
  await page.getByRole('button', { name: 'Responder' }).first().click();
  await page.locator('#lacuna-location').fill('São Paulo');
  await page.getByRole('button', { name: 'Responder e continuar' }).click();

  // A jornada retomada só pode voltar a parar na revisão humana da candidatura.
  await page.locator('#percurso li:nth-child(4)[data-status="waiting_user"]').waitFor({ timeout: 150_000 });

  const run = runtime.runService.listRuns().find((item) => item.kind === 'autopilot');
  const completed = eventsOf(runtime, run.id)
    .filter((event) => event.type === 'autopilot.task.completed')
    .map((event) => event.payload.task);
  assert.deepEqual(completed, ['intake', 'discovery', 'fit'], 'a jornada precisa passar por especialistas reais até a revisão humana');
  const workflow = runtime.runService.getWorkflow(run.id);
  assert.equal(workflow.outputs.discovery.searches[0].source, 'configurada');
  assert.deepEqual(workflow.outputs.discovery.failures, []);
  assert.equal(workflow.plan.find((step) => step.id === 'application').status, 'waiting_user');
  assert.ok(workflow.outputs.fit.items.length >= 2, 'a shortlist real precisa conter as vagas observadas');

  // A lacuna respondida virou fato confirmado: uma nova jornada não repete a pergunta.
  const repeated = await runtime.orchestrator.start({ objective: 'segunda jornada', mode: 'autonomous', input: { targetRoles: 'conduzir candidaturas de engenharia de software remotas' } });
  await repeated.completion;
  assert.ok(
    eventsOf(runtime, repeated.run.id).some((event) => event.type === 'autopilot.task.completed' && event.payload.task === 'intake'),
    'o Intake não deve parar de novo em uma lacuna já resolvida'
  );

  const state = await readFluxoState(fixture.root);
  assert.equal(state.queue.items.length, 3, 'o link repetido do quadro não pode virar uma vaga a mais');
  assert.equal(state.queue.items.every((item) => item.platform === 'INFOJOBS'), true);
  await page.locator('[data-rota="oportunidades"]').click();
  await page.getByText(/Empresa Sintética/).first().waitFor({ timeout: 30_000 });

  const review = await submitThroughUi(page);
  assert.match(review, /Pessoa Sintética E2E/, 'a revisão precisa mostrar o valor que será enviado');
  assert.match(review, /curriculo-sintetico\.txt/, 'a revisão precisa mostrar o currículo anexado');
  assert.equal(board.submissions.length, 1, 'a plataforma controlada deve receber exatamente um envio');
  assert.equal(board.submissions[0].fields.name, 'Pessoa Sintética E2E');
  assert.equal(board.submissions[0].fields.note, '', 'campo sem fato confirmado não pode ser preenchido');
  await page.locator('[data-rota="candidaturas"]').click();
  await page.getByText(/enviada/).first().waitFor({ timeout: 30_000 });
  await page.screenshot({ path: join(artifacts, 'ui-candidatura-confirmada.png'), fullPage: true });

  const applications = await runtime.persistence.getApplications();
  assert.equal(applications.length, 1);
  assert.equal(applications[0].status, 'enviada');
  const evidence = await readFile(join(fixture.root, applications[0].evidencePath));
  assert.deepEqual([...evidence.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const database = new DatabaseSync(join(fixture.root, 'estado', 'fluxo.sqlite'), { readOnly: true });
  try {
    assert.equal(JSON.parse(database.prepare("select payload_json from operational_documents where name = 'applications'").get().payload_json).length, 1);
  } finally { database.close(); }
}

// Preparar → revisar no diálogo → aprovar. A tarefa autorizada segue sozinha
// até a confirmação da plataforma, sem um segundo clique de "enviar".
async function submitThroughUi(page) {
  await page.locator('#lista-decisoes, .lista').first().waitFor({ timeout: 30_000 });
  await page.locator('.item-lista').filter({ hasText: 'Engenharia de software' }).first().click();
  await page.locator('#preparar-candidatura').click();
  const dialogo = page.locator('#dialogo');
  await dialogo.waitFor({ state: 'visible', timeout: 60_000 });
  const review = await dialogo.innerText();
  await page.getByRole('button', { name: /^Aprovar envio para/ }).click();
  await page.waitForFunction(
    () => /recebimento/i.test(document.querySelector('#mensagens')?.textContent ?? ''),
    null,
    { timeout: 90_000 }
  );
  return review;
}

function eventsOf(runtime, runId) {
  return runtime.runService.listEvents(runId).map((event) => ({ type: event.type, payload: JSON.parse(event.payloadJson) }));
}

function observe(page) {
  const errors = [];
  const calls = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('response', async (response) => {
    if (response.status() >= 400) calls.push(`${response.status()} ${response.url()} ${await response.text().catch(() => '')}`.slice(0, 300));
  });
  return { errors, calls };
}

async function report(page, runtime, observed) {
  console.log('ESTADO DA JORNADA:', await page.locator('#estado-trabalho').textContent().catch(() => 'indisponível'));
  console.log('DECISÕES:', await page.locator('#indicador-decisoes-texto').textContent().catch(() => 'indisponível'));
  console.log('TELA:', (await page.locator('#tela').textContent().catch(() => 'indisponível')).slice(0, 800));
  console.log('MENSAGENS:', await page.locator('#mensagens').textContent().catch(() => 'indisponível'));
  console.log('CHAMADAS COM ERRO:', JSON.stringify(observed.calls));
  console.log('ERROS DE PÁGINA:', JSON.stringify(observed.errors));
  for (const run of runtime.runService.listRuns()) {
    console.log('RUN', run.id, run.kind, run.status, JSON.stringify(eventsOf(runtime, run.id).map((event) => [event.type, JSON.stringify(event.payload).slice(0, 200)])));
  }
}

async function appServer(runtime, rootDir) {
  const server = createServer({
    rootDir,
    queueService: runtime.queueService,
    runService: runtime.runService,
    approvalService: runtime.approvalService,
    policyGateway: runtime.policyGateway,
    stateStore: runtime.stateStore,
    applicationFlow: runtime.applicationFlow,
    memoryService: runtime.memoryService,
    intakeService: runtime.intakeService,
    discoveryService: runtime.discoveryService,
    fitService: runtime.fitService,
    followUpMonitor: runtime.followUpMonitor,
    exceptionService: runtime.exceptionService,
    auditService: runtime.auditService,
    authService: runtime.authService,
    autopilotService: runtime.autopilotService,
    orchestrator: runtime.orchestrator,
    resumeImportService: runtime.resumeImportService,
    schedulerService: runtime.schedulerService,
    notificationService: runtime.notificationService,
    runtimeHealth: runtime.runtimeHealth,
    conversationService: runtime.conversationService,
    sessionStore: runtime.sessionStore,
    metricsService: runtime.metricsService
  });
  await listen(server);
  return Object.assign(server, { url: `http://127.0.0.1:${server.address().port}` });
}
