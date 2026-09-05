import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createAgentAdapter } from './agent-adapter.mjs';
import { createApplicationFlow } from './application-flow.mjs';
import { createApplicationService } from './application-service.mjs';
import { createApprovalService } from './approval-service.mjs';
import { createBrowserAdapter } from './browser-adapter.mjs';
import { createPlaywrightCliDriver } from './playwright-cli-driver.mjs';
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
import { createAutopilotService } from './autopilot-service.mjs';
import { createCodexAuthService } from './codex-auth-service.mjs';
import { createCodexHarnessService } from './codex-harness-service.mjs';
import { createCodexSettingsService } from './codex-settings-service.mjs';
import { createPlaywrightDiscoveryAdapter } from './discovery-service.mjs';

export async function createLocalRuntime({ rootDir }) {
  await mkdir(join(rootDir, 'estado'), { recursive: true });
  const runtimeConfig = await readRuntimeConfig(rootDir);
  const dbPath = join(rootDir, 'estado', 'harness.sqlite');
  const queueService = createQueueService({ rootDir, checkpointAfterEachAction: runtimeConfig.checkpointAfterEachAction, maxConsecutiveFailures: runtimeConfig.maxConsecutiveFailures, mutationLock: false });
  const runService = createRunService({ dbPath, maxApplicationsPerRun: runtimeConfig.maxApplicationsPerRun });
  const approvalService = createApprovalService({ dbPath });
  const policyGateway = createPolicyGateway({ approvalService });
  const stateStore = createStore({ rootDir, dbPath });
  const browserAdapter = createBrowserAdapter({
    driver: createPlaywrightCliDriver({ session: runtimeConfig.playwrightSession, cwd: rootDir }), evidenceRoot: rootDir
  });
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
  const discoveryDriver = createPlaywrightCliDriver({ session: runtimeConfig.playwrightSession, cwd: rootDir });
  const fixtureDiscoveryAdapters = createFixtureDiscoveryAdapters();
  const discoveryService = createDiscoveryService({ rootDir, queueService, adapters: Object.fromEntries(Object.keys(fixtureDiscoveryAdapters).map((platform) => [platform, createPlaywrightDiscoveryAdapter({ driver: discoveryDriver, platform })])), fixtureAdapters: fixtureDiscoveryAdapters, mutationLock: false });
  const fitService = createFitService();
  const exceptionService = createExceptionService({ rootDir, runService, mutationLock: false });
  const followUpMonitor = createFollowUpMonitor({ rootDir, adapters: {} });
  const auditService = createAuditService({ rootDir });
  const orchestrator = createAutopilotOrchestrator({ runService, memoryService, auditService, agents: createFixtureAgents({ rootDir, intakeService, discoveryService, fitService, followUpMonitor }) });
  const browserCapture = browserAdapter.captureEvidence.bind(browserAdapter);
  browserAdapter.captureEvidence = async (input) => {
    const sourcePath = await browserCapture(input);
    return evidenceService.record({ sourcePath, reference: input.item?.id ?? input.runId, type: 'envio' });
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
      return applicationService.recordConfirmedApplication({
        item: input.item,
        confirmation: input.confirmation,
        evidencePath: input.payload?.evidencePath ?? '',
        resume: input.payload?.resume ?? '',
        applicationId: input.payload?.applicationId ?? '',
        notes: input.payload?.notes ?? ''
      });
    }
  });
  const codexSettingsService = createCodexSettingsService({ rootDir, readModels: async () => (await codexHarnessService.snapshot()).models ?? [], mutationLock: false });
  const agentAdapter = createAgentAdapter({
    settingsService: codexSettingsService,
    transportFactory: ({ onNotification }) => createStdioAgentTransport({ cwd: rootDir, authMode: runtimeConfig.authMode, onNotification }),
    onNotification(message, runId) {
      if (!runId) return;
      runService.appendEvent({ runId, type: message.method || 'agent.notification', payload: message.params ?? {}, actorType: 'agent' });
    }
  });
  const codexHarnessService = createCodexHarnessService({ request: (method, params) => agentAdapter.request(method, params) });
  const authService = createCodexAuthService({ agentAdapter });
  const autopilotService = createAutopilotService({ runService, agentAdapter, orchestrator });
  runService.reconcile();
  await stateStore.syncFromFiles();

  return {
    runtimeConfig,
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
    async close() {
      await agentAdapter.close();
      stateStore.close();
      approvalService.close();
      runService.close();
    }
  };
}
