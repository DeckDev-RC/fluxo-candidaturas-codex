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
  const metricsService = createMetricsService({ rootDir, readOperations: async () => stateStore.listOperations() });
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
  const agentAdapter = createAgentAdapter({
    transportFactory: ({ onNotification }) => createStdioAgentTransport({ cwd: rootDir, onNotification }),
    onNotification(message, runId) {
      if (!runId) return;
      runService.appendEvent({ runId, type: message.method || 'agent.notification', payload: message.params ?? {}, actorType: 'agent' });
    }
  });
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
    async close() {
      await agentAdapter.close();
      stateStore.close();
      approvalService.close();
      runService.close();
    }
  };
}
