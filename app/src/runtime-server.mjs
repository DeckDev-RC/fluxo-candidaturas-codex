import { createLocalRuntime } from './runtime.mjs';
import { createServer } from './http-server.mjs';

export async function createRuntimeServer({ rootDir, port = 4173 } = {}) {
  const runtime = await createLocalRuntime({ rootDir });
  const server = createServer({
    rootDir,
    queueService: runtime.queueService,
    runService: runtime.runService,
    approvalService: runtime.approvalService,
    stateStore: runtime.stateStore,
    applicationFlow: runtime.applicationFlow,
    messageService: runtime.messageService,
    resumeService: runtime.resumeService,
    evidenceService: runtime.evidenceService,
    assessmentService: runtime.assessmentService,
    legacyImportService: runtime.legacyImportService,
    pendingService: runtime.pendingService,
    checkpointService: runtime.checkpointService,
    metricsService: runtime.metricsService,
    agentAdapter: runtime.agentAdapter,
    autopilotService: runtime.autopilotService,
    memoryService: runtime.memoryService,
    intakeService: runtime.intakeService,
    discoveryService: runtime.discoveryService,
    fitService: runtime.fitService,
    exceptionService: runtime.exceptionService,
    followUpMonitor: runtime.followUpMonitor,
    auditService: runtime.auditService,
    authService: runtime.authService,
    codexHarnessService: runtime.codexHarnessService,
    codexSettingsService: runtime.codexSettingsService,
    resumeImportService: runtime.resumeImportService,
    schedulerService: runtime.schedulerService,
    notificationService: runtime.notificationService,
    runtimeHealth: runtime.runtimeHealth,
    conversationService: runtime.conversationService,
    sessionStore: runtime.sessionStore,
    orchestrator: runtime.orchestrator,
    consistencyService: runtime.consistencyService,
    policyGateway: runtime.policyGateway,
    budget: runtime.campaignBudget,
    requireSession: true
  });
  return { runtime, server, port };
}
