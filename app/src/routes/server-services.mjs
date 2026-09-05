import { join } from 'node:path';
import { readFluxoState } from '../state-reader.mjs';
import { createQueueService } from '../queue-service.mjs';
import { createRunService } from '../run-service.mjs';
import { createApprovalService } from '../approval-service.mjs';
import { createShareableExport } from '../export-service.mjs';
import { createCampaignService } from '../campaign-service.mjs';
import { runPreflight } from '../preflight-service.mjs';
import { createFollowUpService } from '../follow-up-service.mjs';
import { createStore } from '../store.mjs';
import { createMessageService } from '../message-service.mjs';
import { createOnboardingService } from '../onboarding-service.mjs';
import { createResumeService } from '../resume-service.mjs';
import { createEvidenceService } from '../evidence-service.mjs';
import { createAssessmentService } from '../assessment-service.mjs';
import { createLegacyImportService } from '../legacy-import-service.mjs';
import { createPendingService } from '../pending-service.mjs';
import { createCheckpointService } from '../checkpoint-service.mjs';
import { createMetricsService } from '../metrics-service.mjs';
import { createObservability } from '../observability.mjs';
import { createSessionAuth } from '../session-auth.mjs';
import { createPolicyGateway } from '../policy.mjs';
import { createAutopilotService } from '../autopilot-service.mjs';
import { createMemoryService } from '../memory-service.mjs';
import { createIntakeService } from '../intake-service.mjs';
import { createDiscoveryService } from '../discovery-service.mjs';
import { createFitService } from '../fit-service.mjs';
import { createExceptionService } from '../exception-service.mjs';
import { createFollowUpMonitor } from '../follow-up-monitor.mjs';
import { createAuditService } from '../audit-service.mjs';
import { createCodexAuthService } from '../codex-auth-service.mjs';
import { createCodexHarnessService } from '../codex-harness-service.mjs';
import { createCodexSettingsService } from '../codex-settings-service.mjs';
import { createResumeImportService } from '../resume-import-service.mjs';
import { createSchedulerService } from '../scheduler-service.mjs';
import { createNotificationService } from '../notification-service.mjs';
import { createRuntimeHealth } from '../runtime-health.mjs';
import { createSessionStore } from '../session-store.mjs';
import { createConsistencyService } from '../consistency-service.mjs';
import { createUnavailableCodexHarness } from './codex-routes.mjs';

// Resolve os serviços do servidor: usa o que foi injetado pelo runtime e cria um
// padrão local só para o que faltar. Devolve também quem precisa ser fechado.
export function resolveServerServices(options) {
  const { rootDir } = options;
  const dbPath = join(rootDir, 'estado', 'harness.sqlite');
  const owned = [];
  const own = (service) => { owned.push(service); return service; };

  const runService = options.runService ?? own(createRunService({ dbPath }));
  const approvalService = options.approvalService ?? own(createApprovalService({ dbPath }));
  const policyGateway = options.policyGateway ?? createPolicyGateway({ approvalService });
  const campaignService = own(createCampaignService({ rootDir }));
  const memoryService = options.memoryService ?? createMemoryService({ rootDir, mutationLock: false });
  const stateStore = options.stateStore ?? own(createStore({ rootDir, dbPath }));
  const agentAdapter = options.agentAdapter;
  const authService = options.authService ?? createCodexAuthService();
  const codexHarnessService = options.codexHarnessService
    ?? (agentAdapter?.request ? createCodexHarnessService({ request: (method, params) => agentAdapter.request(method, params) }) : createUnavailableCodexHarness());
  const queueService = options.queueService ?? createQueueService({ rootDir });

  return {
    rootDir,
    owned,
    runService,
    approvalService,
    policyGateway,
    campaignService,
    memoryService,
    stateStore,
    agentAdapter,
    authService,
    codexHarnessService,
    queueService,
    exportService: options.exportService ?? { createShareableExport: () => createShareableExport({ rootDir, mutationLock: false }) },
    preflightService: options.preflightService ?? { runPreflight: (input) => runPreflight({ rootDir, ...input }) },
    followUpService: options.followUpService ?? own(createFollowUpService({ rootDir })),
    messageService: options.messageService ?? createMessageService({ rootDir, policyGateway }),
    onboardingService: options.onboardingService ?? own(createOnboardingService({ rootDir, memoryService })),
    resumeService: options.resumeService ?? createResumeService({ rootDir }),
    evidenceService: options.evidenceService ?? createEvidenceService({ rootDir }),
    assessmentService: options.assessmentService ?? createAssessmentService({ rootDir, policyGateway }),
    legacyImportService: options.legacyImportService ?? createLegacyImportService({ rootDir }),
    pendingService: options.pendingService ?? own(createPendingService({ rootDir })),
    checkpointService: options.checkpointService ?? createCheckpointService({ rootDir }),
    metricsService: options.metricsService ?? own(createMetricsService({ rootDir })),
    autopilotService: options.autopilotService ?? createAutopilotService({ rootDir, runService, agentAdapter }),
    intakeService: options.intakeService ?? createIntakeService({ rootDir, memoryService }),
    discoveryService: options.discoveryService ?? createDiscoveryService({ rootDir, queueService, adapters: {} }),
    fitService: options.fitService ?? createFitService(),
    exceptionService: options.exceptionService ?? createExceptionService({ rootDir, runService }),
    followUpMonitor: options.followUpMonitor ?? createFollowUpMonitor({ rootDir, adapters: {} }),
    auditService: options.auditService ?? createAuditService({ rootDir }),
    codexSettingsService: options.codexSettingsService ?? createCodexSettingsService({ rootDir, readModels: async () => (await codexHarnessService.snapshot()).models ?? [], mutationLock: false }),
    sessionAuth: createSessionAuth({ required: options.requireSession === true }),
    resumeImportService: options.resumeImportService ?? createResumeImportService({ rootDir, memoryService }),
    schedulerService: options.schedulerService ?? createSchedulerService({ rootDir }),
    notificationService: options.notificationService ?? createNotificationService({ rootDir }),
    runtimeHealth: options.runtimeHealth ?? createRuntimeHealth({ authService }),
    sessionStore: options.sessionStore ?? createSessionStore({ rootDir }),
    orchestrator: options.orchestrator ?? options.autopilotService,
    consistencyService: options.consistencyService ?? createConsistencyService({
      readState: () => readFluxoState(rootDir),
      readRuns: async () => runService.listRuns(),
      listEvents: (runId) => runService.listEvents(runId).map((event) => ({ type: event.type }))
    }),
    budget: options.budget,
    applicationFlow: options.applicationFlow,
    // A conversa com a IA só existe quando o runtime a fornece (app-server real).
    conversationService: options.conversationService ?? null,
    observability: options.observability ?? createObservability(),
    actorResolver: options.actorResolver ?? (({ authorization }) => authorization.actor)
  };
}
