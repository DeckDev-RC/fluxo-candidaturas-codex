import { createAgentEventHandler } from './agent-events.mjs';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createAgentAdapter } from './agent-adapter.mjs';
import { createApplicationFlow } from './application-flow.mjs';
import { createApplicationService } from './application-service.mjs';
import { createApprovalService } from './approval-service.mjs';
import { createBrowserAdapter } from './browser-adapter.mjs';
import { createPlaywrightCliDriver } from './playwright-cli-driver.mjs';
import { createPlaywrightDriver } from './playwright-driver.mjs';
import { createPlatformAdapters } from './platform-adapters.mjs';
import { createPersistenceAuthority } from './persistence-authority.mjs';
import { createDomainTools } from './domain-tools.mjs';
import { createQueueService } from './queue-service.mjs';
import { createRunService } from './run-service.mjs';
import { createStdioAgentTransport } from './stdio-agent-transport.mjs';
import { resolveCodexCommand } from './codex-command.mjs';
import { createStore } from './store.mjs';
import { readRuntimeConfig } from './runtime-config.mjs';
import { readFluxoState } from './state-reader.mjs';
import { createResumeService } from './resume-service.mjs';
import { createEvidenceService } from './evidence-service.mjs';
import { createAssessmentService } from './assessment-service.mjs';
import { createLegacyImportService } from './legacy-import-service.mjs';
import { createPendingService } from './pending-service.mjs';
import { createCheckpointService } from './checkpoint-service.mjs';
import { createMetricsService } from './metrics-service.mjs';
import { createPolicyGateway } from './policy.mjs';
import { createMessageService } from './message-service.mjs';
import { createMemoryService } from './memory-service.mjs';
import { createIntakeService } from './intake-service.mjs';
import { createDiscoveryService } from './discovery-service.mjs';
import { createFitService } from './fit-service.mjs';
import { createExceptionService } from './exception-service.mjs';
import { createFollowUpMonitor } from './follow-up-monitor.mjs';
import { createAuditService } from './audit-service.mjs';
import { createAutopilotOrchestrator } from './orchestrator-service.mjs';
import { createFixtureAgents, createFixtureDiscoveryAdapters } from './fixture-agent-set.mjs';
import { createProductionAgents } from './production-agents.mjs';
import { createAutopilotService } from './autopilot-service.mjs';
import { createCodexAuthService } from './codex-auth-service.mjs';
import { assinaturaDasFerramentas, createConversationService } from './conversation-service.mjs';
import { retratoParaConversa } from './conversation-snapshot.mjs';
import { createCodexHarnessService } from './codex-harness-service.mjs';
import { createCodexSettingsService } from './codex-settings-service.mjs';
import { createShareableExport } from './export-service.mjs';
import { createPlaywrightDiscoveryAdapter } from './discovery-service.mjs';
import { createResumeImportService } from './resume-import-service.mjs';
import { createSchedulerService } from './scheduler-service.mjs';
import { createSchedulerRunner } from './scheduler-runner.mjs';
import { createNotificationService } from './notification-service.mjs';
import { createRuntimeHealth } from './runtime-health.mjs';
import { createReadinessService } from './readiness-service.mjs';
import { createSessionStore } from './session-store.mjs';
import { createCampaignBudget } from './campaign-budget.mjs';
import { createCampaignService } from './campaign-service.mjs';
import { createConsistencyService } from './consistency-service.mjs';
import { createFormController } from './form-controller.mjs';

export async function createLocalRuntime({ rootDir, browserDriver, headless, browserHost = null, schedulerTickMs = 60_000 } = {}) {
  await mkdir(join(rootDir, 'estado'), { recursive: true });
  const persistence = createPersistenceAuthority({ rootDir });
  if (!['campanha/config.json', 'fila/vagas.json', 'candidaturas/candidaturas.json'].some(path => existsSync(join(rootDir, path)))) await persistence.initializeNew();
  const runtimeConfig = await readRuntimeConfig(rootDir);
  const dbPath = join(rootDir, 'estado', 'harness.sqlite');
  const queueService = createQueueService({ rootDir, checkpointAfterEachAction: runtimeConfig.checkpointAfterEachAction, maxConsecutiveFailures: runtimeConfig.maxConsecutiveFailures, mutationLock: false });
  const runService = createRunService({ dbPath, maxApplicationsPerRun: runtimeConfig.maxApplicationsPerRun });
  const approvalService = createApprovalService({ dbPath });
  const policyGateway = createPolicyGateway({ approvalService });
  const stateStore = createStore({ rootDir, dbPath });
  const driver = browserDriver ?? createPlaywrightDriver({ rootDir, headless: headless ?? runtimeConfig.playwrightHeadless, host: browserHost });
  const platformAdapters = createPlatformAdapters({ driver });
  const browserAdapter = createBrowserAdapter({ driver, evidenceRoot: rootDir });
  const applicationService = createApplicationService({ rootDir, mutationLock: false });
  const resumeService = createResumeService({ rootDir });
  const evidenceService = createEvidenceService({ rootDir, mutationLock: false });
  const messageService = createMessageService({ rootDir, policyGateway });
  const assessmentService = createAssessmentService({ rootDir, policyGateway });
  const legacyImportService = createLegacyImportService({ rootDir });
  const pendingService = createPendingService({ rootDir });
  const checkpointService = createCheckpointService({ rootDir, mutationLock: false });
  const metricsService = createMetricsService({ rootDir, readOperations: async () => stateStore.listOperations(), readRuns: async () => runService.listRuns(), readExceptions: async () => exceptionService.list(), readTraces: async () => [] });
  const memoryService = createMemoryService({ rootDir, persistence, mutationLock: false });
  const intakeService = createIntakeService({ rootDir, memoryService });
  const fixtureDiscoveryAdapters = createFixtureDiscoveryAdapters();
  const discoveryService = createDiscoveryService({ rootDir, persistence, queueService, adapters: platformAdapters, fixtureAdapters: fixtureDiscoveryAdapters, mutationLock: false });
  const fitService = createFitService({ queueService });
  const exceptionService = createExceptionService({ rootDir, persistence, runService, mutationLock: false });
  const followUpMonitor = createFollowUpMonitor({ rootDir, persistence, adapters: platformAdapters });
  const auditService = createAuditService({ rootDir });
  const campaignService = createCampaignService({ rootDir, persistence, mutationLock: false });
  const resumeImportService = createResumeImportService({ rootDir, memoryService });
  const schedulerService = createSchedulerService({ rootDir, persistence, minIntervalMs: runtimeConfig.followUpMinIntervalMs });
  const notificationService = createNotificationService({ rootDir, persistence });
  const sessionStore = createSessionStore({ rootDir });
  const campaignBudget = createCampaignBudget({ config: runtimeConfig });
  const fixtureOrchestrator = createAutopilotOrchestrator({ runService, memoryService, auditService, agents: createFixtureAgents({ rootDir, intakeService, discoveryService, fitService, followUpMonitor }) });
  const productionAgents = createProductionAgents({ intakeService, discoveryService, fitService, followUpMonitor, memoryService, resumeImportService, campaignService, runtimeConfig });
  const orchestrator = createAutopilotOrchestrator({ runService, memoryService, auditService, agents: productionAgents, budget: campaignBudget, maxRetries: runtimeConfig.maxTaskAttempts });
  const browserCapture = browserAdapter.captureEvidence.bind(browserAdapter);
  browserAdapter.captureEvidence = async (input) => {
    const sourcePath = await browserCapture(input);
    return { path: sourcePath, sha256: createHash('sha256').update(await readFile(join(rootDir, sourcePath))).digest('hex') };
  };
  const applicationFlow = createApplicationFlow({
    queueService,
    runService,
    approvalService,
    policyGateway,
    browserAdapter,
    formController: createFormController({ browserAdapter }),
    checkpointService,
    checkpointAfterEachAction: runtimeConfig.checkpointAfterEachAction,
    evidenceMode: runtimeConfig.evidenceMode,
    preflightReady: async () => (await readFluxoState(rootDir)).installation.ready,
    async recordApplication(input) {
      const result = await applicationService.recordConfirmedApplication({
        item: input.item,
        confirmation: input.confirmation,
        evidencePath: input.payload?.evidencePath ?? '',
        resume: input.payload?.resume ?? '',
        applicationId: input.payload?.applicationId ?? '',
        notes: input.payload?.notes ?? ''
      });
      return result.record ?? result;
    }
  });
  Object.assign(productionAgents, createProductionAgents({ intakeService, discoveryService, fitService, followUpMonitor, applicationFlow, memoryService, resumeImportService, campaignService, runtimeConfig }));
  const codexSettingsService = createCodexSettingsService({ rootDir, readModels: async () => (await codexHarnessService.snapshot()).models ?? [], mutationLock: false });
  // O registro de ferramentas é exposto no runtime para que a suíte exercite cada
  // ferramenta pela composição real, não só por construção isolada.
  const domainTools = createDomainTools({ rootDir, runService, readState: () => readFluxoState(rootDir), discoveryService, fitService, memoryService, applicationFlow, browserAdapter, followUpMonitor, resumeImportService, intakeService, queueService, campaignService, schedulerService, codexSettingsService, auditService, exportService: { createShareableExport: () => createShareableExport({ rootDir, mutationLock: false }) }, budget: campaignBudget, platformUrls: () => runtimeConfig.platformUrls ?? {} });
  // O Codex é procurado a cada início do transporte: quem instala o Codex com o
  // app aberto só precisa clicar em "Verificar novamente".
  const codex = () => resolveCodexCommand({ configured: runtimeConfig.codexCommand });
  // Notificações de conta (login concluído, conta atualizada) não pertencem a
  // nenhuma execução: vão para o serviço de auth, que avisa a saúde e a interface.
  const eventosDeExecucao = createAgentEventHandler(runService, { budget: campaignBudget });
  let authService = null;
  let conversationService = null;
  let fechamento = null;
  const agentAdapter = createAgentAdapter({
    domainTools,
    settingsService: codexSettingsService,
    transportFactory: ({ onNotification, onRequest, onClose }) => {
      const resolved = codex();
      return createStdioAgentTransport({ command: resolved.command || resolved.path || 'codex', shell: resolved.shell, cwd: rootDir, authMode: runtimeConfig.authMode, onNotification, onRequest, onClose });
    },
    // Uma notificação do Codex nunca pode derrubar o serviço: falha em um ouvinte
    // é registrada e os demais seguem.
    onNotification: (message, runId) => {
      try {
        if (authService?.handleNotification(message)) return;
        if (conversationService?.handleNotification(message)) return;
        eventosDeExecucao(message, runId);
      } catch (error) { registrarFalhaSilenciosa('notificação do agente', error); }
    },
    onToolCall: (chamada) => { try { conversationService?.handleToolCall(chamada); } catch (error) { registrarFalhaSilenciosa('narração de ferramenta', error); } }
  });
  const codexHarnessService = createCodexHarnessService({ request: (method, params) => agentAdapter.request(method, params) });
  authService = createCodexAuthService({ agentAdapter });
  const runtimeHealth = createRuntimeHealth({ authService, codex });
  const autopilotService = createAutopilotService({ runService, agentAdapter, orchestrator: fixtureOrchestrator, productionOrchestrator: orchestrator });
  exceptionService.setOrchestrator?.(orchestrator);
  for (const run of runService.listRuns()) agentAdapter.bindRun(run.id, run.agentThreadId, run.currentTurnId);
  runService.reconcile();
  await stateStore.syncFromFiles();
  // A agenda só funciona com o processo aberto; o executor liga junto do runtime.
  const schedulerRunner = createSchedulerRunner({
    schedulerService,
    followUpMonitor,
    notificationService,
    budget: campaignBudget,
    tickMs: schedulerTickMs
  }).start();
  const consistencyService = createConsistencyService({
    readState: () => readFluxoState(rootDir, { persistence }),
    readRuns: async () => runService.listRuns(),
    listEvents: (runId) => runService.listEvents(runId).map((event) => ({ type: event.type, ...safeParse(event.payloadJson) }))
  });
  conversationService = createConversationService({
    agentAdapter,
    rootDir,
    runService,
    tabs: () => browserAdapter.tabs(),
    loginState: (platform) => browserAdapter.loginState(platform),
    codexSettings: codexSettingsService,
    toolsSignature: assinaturaDasFerramentas(domainTools.definitions),
    snapshot: () => retratoParaConversa({ rootDir, persistence, memoryService, approvalService, runService, runtimeHealth, browserAdapter })
  });
  // A preparação é do próprio app e roda na partida: installation.ready reflete o
  // que importa para a IA operar (navegador e plataformas), sem clique da pessoa.
  const readinessService = createReadinessService({ rootDir, memoryService, campaignService, runtimeHealth, browserTabs: () => browserAdapter.tabs() });
  await readinessService.run({ probeAi: false }).catch(() => {});

  return {
    conversationService,
    readinessService,
    runtimeConfig,
    persistence,
    queueService,
    runService,
    approvalService,
    policyGateway,
    stateStore,
    browserAdapter,
    agentAdapter,
    domainTools,
    applicationFlow,
    resumeService, evidenceService, messageService, assessmentService, legacyImportService, pendingService, checkpointService, metricsService,
    memoryService, intakeService, discoveryService, fitService, exceptionService, followUpMonitor, auditService, authService, codexHarnessService, codexSettingsService, orchestrator, autopilotService,
    resumeImportService, schedulerService, schedulerRunner, notificationService, sessionStore, runtimeHealth, campaignBudget, campaignService, consistencyService,
    // Encerramento idempotente e com prazo por recurso: um agente ou navegador
    // que não responde não pode impedir o banco de fechar limpo.
    close() {
      if (!fechamento) fechamento = (async () => {
        schedulerRunner.stop();
        await Promise.allSettled([
          comPrazo(() => agentAdapter.close(), 3_000),
          comPrazo(() => driver.close?.(), 3_000)
        ]);
        for (const recurso of [queueService, applicationService, pendingService, metricsService, persistence, stateStore, approvalService, runService]) {
          try { recurso.close?.(); } catch (error) { registrarFalhaSilenciosa('fechar recurso', error); }
        }
      })();
      return fechamento;
    }
  };
}

async function comPrazo(operacao, ms) {
  let timer;
  try {
    await Promise.race([Promise.resolve().then(operacao), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('prazo esgotado')), ms); })]);
  } catch (error) { registrarFalhaSilenciosa('encerramento', error); } finally { clearTimeout(timer); }
}

// Falhas que não podem interromper o serviço ficam registradas em estado/logs.
function registrarFalhaSilenciosa(origem, error) {
  try { process.emitWarning(`${origem}: ${error?.message ?? error}`, { code: 'FLUXO_FALHA_SILENCIOSA' }); } catch { /* sem canal */ }
}

function safeParse(json) {
  try { return JSON.parse(json ?? '{}'); } catch { return {}; }
}
