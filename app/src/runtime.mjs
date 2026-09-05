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
import { createCodexHarnessService } from './codex-harness-service.mjs';
import { createCodexSettingsService } from './codex-settings-service.mjs';
import { createPlaywrightDiscoveryAdapter } from './discovery-service.mjs';
import { createResumeImportService } from './resume-import-service.mjs';
import { createSchedulerService } from './scheduler-service.mjs';
import { createNotificationService } from './notification-service.mjs';
import { createRuntimeHealth } from './runtime-health.mjs';
import { createSessionStore } from './session-store.mjs';
import { createCampaignBudget } from './campaign-budget.mjs';
import { createCampaignService } from './campaign-service.mjs';

export async function createLocalRuntime({ rootDir, browserDriver, headless } = {}) {
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
  const driver = browserDriver ?? createPlaywrightDriver({ rootDir, headless: headless ?? runtimeConfig.playwrightHeadless });
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
  const memoryService = createMemoryService({ rootDir, mutationLock: false });
  const intakeService = createIntakeService({ rootDir, memoryService });
  const fixtureDiscoveryAdapters = createFixtureDiscoveryAdapters();
  const discoveryService = createDiscoveryService({ rootDir, queueService, adapters: platformAdapters, fixtureAdapters: fixtureDiscoveryAdapters, mutationLock: false });
  const fitService = createFitService();
  const exceptionService = createExceptionService({ rootDir, runService, mutationLock: false });
  const followUpMonitor = createFollowUpMonitor({ rootDir, adapters: platformAdapters });
  const auditService = createAuditService({ rootDir });
  const campaignService = createCampaignService({ rootDir, persistence, mutationLock: false });
  const resumeImportService = createResumeImportService({ rootDir, memoryService });
  const schedulerService = createSchedulerService({ rootDir, minIntervalMs: runtimeConfig.followUpMinIntervalMs });
  const notificationService = createNotificationService({ rootDir });
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
  const agentAdapter = createAgentAdapter({
    domainTools: createDomainTools({ rootDir, runService, readState: () => readFluxoState(rootDir), discoveryService, fitService, memoryService, applicationFlow, browserAdapter, followUpMonitor, resumeImportService }),
    settingsService: codexSettingsService,
    transportFactory: ({ onNotification, onRequest }) => createStdioAgentTransport({ cwd: rootDir, authMode: runtimeConfig.authMode, onNotification, onRequest }),
    onNotification: createAgentEventHandler(runService)
  });
  const codexHarnessService = createCodexHarnessService({ request: (method, params) => agentAdapter.request(method, params) });
  const authService = createCodexAuthService({ agentAdapter });
  const runtimeHealth = createRuntimeHealth({ authService });
  const autopilotService = createAutopilotService({ runService, agentAdapter, orchestrator: fixtureOrchestrator, productionOrchestrator: orchestrator });
  exceptionService.setOrchestrator?.(orchestrator);
  for (const run of runService.listRuns()) agentAdapter.bindRun(run.id, run.agentThreadId, run.currentTurnId);
  runService.reconcile();
  await stateStore.syncFromFiles();

  return {
    runtimeConfig,
    persistence,
    queueService,
    runService,
    approvalService,
    policyGateway,
    stateStore,
    browserAdapter,
    agentAdapter,
    applicationFlow,
    resumeService, evidenceService, messageService, assessmentService, legacyImportService, pendingService, checkpointService, metricsService,
    memoryService, intakeService, discoveryService, fitService, exceptionService, followUpMonitor, auditService, authService, codexHarnessService, codexSettingsService, orchestrator, autopilotService,
    resumeImportService, schedulerService, notificationService, sessionStore, runtimeHealth, campaignBudget, campaignService,
    async close() {
      await agentAdapter.close();
      await driver.close?.();
      for (const service of [queueService, applicationService, pendingService, metricsService]) service.close?.();
      persistence.close();
      stateStore.close();
      approvalService.close();
      runService.close();
    }
  };
}
