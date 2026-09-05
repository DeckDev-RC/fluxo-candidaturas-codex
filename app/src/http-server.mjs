import { createServer as createHttpServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readFluxoState } from './state-reader.mjs';
import { createQueueService } from './queue-service.mjs';
import { createRunService } from './run-service.mjs';
import { createApprovalService } from './approval-service.mjs';
import { createShareableExport } from './export-service.mjs';
import { createCampaignService } from './campaign-service.mjs';
import { getFluxoProfileSummary } from './profile-service.mjs';
import { runPreflight } from './preflight-service.mjs';
import { createFollowUpService } from './follow-up-service.mjs';
import { createStore } from './store.mjs';
import { readRuntimeConfig } from './runtime-config.mjs';
import { createMessageService } from './message-service.mjs';
import { createOnboardingService } from './onboarding-service.mjs';
import { createResumeService } from './resume-service.mjs';
import { createEvidenceService } from './evidence-service.mjs';
import { createAssessmentService } from './assessment-service.mjs';
import { createLegacyImportService } from './legacy-import-service.mjs';
import { createPendingService } from './pending-service.mjs';
import { createCheckpointService } from './checkpoint-service.mjs';
import { createMetricsService } from './metrics-service.mjs';
import { acquireFluxoLock } from './lock.mjs';
import { isLocalRequest } from './local-auth.mjs';
import { createObservability } from './observability.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { createSessionAuth } from './session-auth.mjs';
import { createPolicyGateway } from './policy.mjs';
import { createAutopilotService } from './autopilot-service.mjs';
import { createMemoryService } from './memory-service.mjs';
import { createIntakeService } from './intake-service.mjs';
import { createDiscoveryService } from './discovery-service.mjs';
import { createFitService } from './fit-service.mjs';
import { createExceptionService } from './exception-service.mjs';
import { createFollowUpMonitor } from './follow-up-monitor.mjs';
import { createAuditService } from './audit-service.mjs';
import { createCodexAuthService } from './codex-auth-service.mjs';
import { createCodexHarnessService } from './codex-harness-service.mjs';
import { createCodexSettingsService } from './codex-settings-service.mjs';

const PUBLIC_DIR = new URL('../public/', import.meta.url);
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/preflight-summary.js', ['preflight-summary.js', 'text/javascript; charset=utf-8']],
  ['/oauth-window.js', ['oauth-window.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/fixtures/ui-state.json', ['fixtures/ui-state.json', 'application/json; charset=utf-8']]
]);

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

export function createServer({ rootDir, queueService = createQueueService({ rootDir }), exportService = { createShareableExport: () => createShareableExport({ rootDir, mutationLock: false }) }, preflightService, followUpService: injectedFollowUpService, followUpMonitor: injectedFollowUpMonitor, messageService: injectedMessageService, onboardingService: injectedOnboardingService, resumeService: injectedResumeService, evidenceService: injectedEvidenceService, assessmentService: injectedAssessmentService, legacyImportService: injectedLegacyImportService, pendingService: injectedPendingService, checkpointService: injectedCheckpointService, metricsService: injectedMetricsService, agentAdapter, autopilotService: injectedAutopilotService, memoryService: injectedMemoryService, intakeService: injectedIntakeService, discoveryService: injectedDiscoveryService, fitService: injectedFitService, exceptionService: injectedExceptionService, auditService: injectedAuditService, authService: injectedAuthService, codexHarnessService: injectedCodexHarnessService, codexSettingsService: injectedCodexSettingsService, observability = createObservability(), requireSession = false, stateStore, applicationFlow, runService: injectedRunService, approvalService: injectedApprovalService, policyGateway: injectedPolicyGateway, actorResolver = ({ authorization }) => authorization.actor }) {
  mkdirSync(join(rootDir, 'estado'), { recursive: true });
  const runService = injectedRunService ?? createRunService({ dbPath: join(rootDir, 'estado', 'harness.sqlite') });
  const approvalService = injectedApprovalService ?? createApprovalService({ dbPath: join(rootDir, 'estado', 'harness.sqlite') });
  const policyGateway = injectedPolicyGateway ?? createPolicyGateway({ approvalService });
  const campaignService = createCampaignService({ rootDir });
  const memoryService = injectedMemoryService ?? createMemoryService({ rootDir, mutationLock: false });
  const effectivePreflightService = preflightService ?? { runPreflight: (options) => runPreflight({ rootDir, ...options }) };
  const followUpService = injectedFollowUpService ?? createFollowUpService({ rootDir });
  const messageService = injectedMessageService ?? createMessageService({ rootDir, policyGateway });
  const onboardingService = injectedOnboardingService ?? createOnboardingService({ rootDir, memoryService });
  const resumeService = injectedResumeService ?? createResumeService({ rootDir });
  const evidenceService = injectedEvidenceService ?? createEvidenceService({ rootDir });
  const assessmentService = injectedAssessmentService ?? createAssessmentService({ rootDir, policyGateway });
  const legacyImportService = injectedLegacyImportService ?? createLegacyImportService({ rootDir });
  const pendingService = injectedPendingService ?? createPendingService({ rootDir });
  const checkpointService = injectedCheckpointService ?? createCheckpointService({ rootDir });
  const metricsService = injectedMetricsService ?? createMetricsService({ rootDir });
  const effectiveStateStore = stateStore ?? createStore({ rootDir, dbPath: join(rootDir, 'estado', 'harness.sqlite') });
  const ownsRunService = !injectedRunService;
  const ownsApprovalService = !injectedApprovalService;
  const ownsStateStore = !stateStore;
  const preparedApplications = new Map();
  const autopilotService = injectedAutopilotService ?? createAutopilotService({ rootDir, runService, agentAdapter });
  const intakeService = injectedIntakeService ?? createIntakeService({ rootDir, memoryService });
  const discoveryService = injectedDiscoveryService ?? createDiscoveryService({ rootDir, queueService, adapters: {} });
  const fitService = injectedFitService ?? createFitService();
  const exceptionService = injectedExceptionService ?? createExceptionService({ rootDir, runService });
  const followUpMonitor = injectedFollowUpMonitor ?? createFollowUpMonitor({ rootDir, adapters: {} });
  const auditService = injectedAuditService ?? createAuditService({ rootDir });
  const authService = injectedAuthService ?? createCodexAuthService();
  const codexHarnessService = injectedCodexHarnessService ?? (agentAdapter?.request ? createCodexHarnessService({ request: (method, params) => agentAdapter.request(method, params) }) : createUnavailableCodexHarness());
  const codexSettingsService = injectedCodexSettingsService ?? createCodexSettingsService({ rootDir, readModels: async () => (await codexHarnessService.snapshot()).models ?? [], mutationLock: false });
  const sessionAuth = createSessionAuth({ required: requireSession });
  const server = createHttpServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const requestId = randomUUID();
    const startedAt = Date.now();
    response.setHeader('x-request-id', requestId);
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'");
    response.setHeader('x-content-type-options', 'nosniff');
    response.once('finish', () => observability.record({ method: request.method, path, status: response.statusCode, durationMs: Date.now() - startedAt }));
    if (!isLocalRequest(request)) { sendJson(response, 403, { error: { code: 'local_auth_required', message: 'Apenas conexões locais são permitidas.' } }); return; }
    const isPublicBootstrap = path === '/health' || path === '/' || path === '/api/v1/auth/session';
    const authorization = sessionAuth.authorize(request, { mutation: !['GET', 'HEAD', 'OPTIONS'].includes(request.method) });
    if (!isPublicBootstrap && !authorization.ok) { sendJson(response, authorization.status, { error: { code: authorization.code, message: authorization.message, retryable: false, actionRequired: 'authenticate', request_id: requestId } }); return; }
    let releaseMutation;
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    const queueMutationHandled = path.startsWith('/api/v1/queue/') && queueService.handlesMutationLock;
    const serviceMutationHandled = queueMutationHandled || path === '/api/v1/campaign' && campaignService.handlesMutationLock || path === '/api/v1/onboarding' && onboardingService.handlesMutationLock || path === '/api/v1/state/checkpoint' && checkpointService.handlesMutationLock || path === '/api/v1/evidence' && evidenceService.handlesMutationLock || path.startsWith('/api/v1/assessments') && assessmentService.handlesMutationLock || path === '/api/v1/imports/legacy' && legacyImportService.handlesMutationLock || /^\/api\/v1\/applications\/[^/]+\/events$/.test(path) && followUpService.handlesMutationLock || path === '/api/v1/messages/draft' && messageService.handlesMutationLock || path.startsWith('/api/v1/memory') && memoryService.handlesMutationLock || path === '/api/v1/intake/commit' && memoryService.handlesMutationLock || path.startsWith('/api/v1/exceptions') && exceptionService.handlesMutationLock || path.startsWith('/api/v1/discovery') && discoveryService.handlesMutationLock;
    if (isMutation && !serviceMutationHandled) {
      try {
        releaseMutation = await acquireFluxoLock(rootDir);
        let released = false;
        const release = async () => { if (released) return; released = true; await releaseMutation(); };
        response.once('finish', release);
        response.once('close', release);
      } catch (error) {
        sendDomainError(response, error);
        return;
      }
    }
    if (isMutation) {
      response.__mutationEnvelope = true;
      if (effectiveStateStore.isAggregateBlocked?.('http', path)) {
        sendDomainError(response, Object.assign(new Error('A mutação aguarda reconciliação.'), { code: 'aggregate_blocked' }));
        return;
      }
      if (effectiveStateStore.startOperation && effectiveStateStore.updateOperation) {
        const targets = mutationTargets(rootDir, path);
        for (const target of targets) if (existsSync(target)) copyFileSync(target, `${target}.bak`);
        const operation = effectiveStateStore.startOperation({ kind: `${request.method} ${path}`, aggregateType: 'http', aggregateId: path, input: {}, beforeHash: hashTargets(targets) });
        effectiveStateStore.updateOperation(operation.id, { status: 'running' });
        response.once('finish', () => effectiveStateStore.updateOperation(operation.id, {
          status: response.statusCode >= 500 ? 'needs_reconcile' : response.statusCode >= 400 ? 'failed' : 'succeeded',
          afterHash: hashTargets(targets),
          blocked: response.statusCode >= 500,
          finishedAt: new Date().toISOString()
        }));
      }
    }

    if (request.method === 'GET' && path === '/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'GET' && path === '/api/v1/observability') {
      sendJson(response, 200, observability.snapshot());
      return;
    }
    if (request.method === 'GET' && path === '/api/v1/operations') {
      sendJson(response, 200, effectiveStateStore.listOperations ? effectiveStateStore.listOperations() : []);
      return;
    }
    if (request.method === 'GET' && path === '/api/v1/auth/session') {
      sendJson(response, 200, sessionAuth.bootstrap(response));
      return;
    }
    if (request.method === 'GET' && path === '/api/v1/auth/openai') { try { sendJson(response, 200, await authService.status()); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/auth/openai/login') { try { sendJson(response, 202, await authService.startLogin(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/auth/openai/logout') { try { sendJson(response, 200, await authService.logout()); } catch (error) { sendDomainError(response, error); } return; }

    if (request.method === 'GET' && path === '/api/v1/state') {
      try {
        const state = await readFluxoState(rootDir);
        sendJson(response, 200, state);
      } catch {
        sendJson(response, 500, {
          error: { code: 'state_read_failed', message: 'Não foi possível ler o estado local do Fluxo.' }
        });
      }
      return;
    }

    if (request.method === 'GET' && path === '/api/v1/state/preflight') {
      sendJson(response, 200, (await readFluxoState(rootDir)).preflight);
      return;
    }

    if (request.method === 'GET' && path === '/api/v1/state/checkpoint') {
      sendJson(response, 200, (await readFluxoState(rootDir)).checkpoint);
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/state/checkpoint') {
      try { sendJson(response, 200, await checkpointService.save(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); }
      return;
    }
    if (request.method === 'DELETE' && path === '/api/v1/state/checkpoint') {
      try { sendJson(response, 200, await checkpointService.clear()); } catch (error) { sendDomainError(response, error); }
      return;
    }

    if (request.method === 'GET' && path === '/api/v1/profile') {
      sendJson(response, 200, await getFluxoProfileSummary(rootDir));
      return;
    }

    if (request.method === 'GET' && path === '/api/v1/memory') { try { sendJson(response, 200, await memoryService.safeSummary()); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/memory/facts') { try { sendJson(response, 200, await memoryService.upsertFacts((await readJsonBody(request)).facts ?? [])); } catch (error) { sendDomainError(response, error); } return; }
    const memoryFactMatch = path.match(/^\/api\/v1\/memory\/facts\/([^/]+)$/);
    if (request.method === 'DELETE' && memoryFactMatch) { try { sendJson(response, 200, await memoryService.removeFact(decodeURIComponent(memoryFactMatch[1]))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/intake/preview') { try { sendJson(response, 200, await intakeService.preview(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/intake/commit') { try { sendJson(response, 200, await intakeService.commit(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/discovery') { try { sendJson(response, 200, await discoveryService.discover(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/discovery/resume') { try { sendJson(response, 200, await discoveryService.resume(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/fit') { try { sendJson(response, 200, fitService.shortlist(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/fit/override') { try { sendJson(response, 200, await fitService.override(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'GET' && path === '/api/v1/exceptions') { try { sendJson(response, 200, await exceptionService.list(Object.fromEntries(new URL(request.url ?? '/', 'http://127.0.0.1').searchParams))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/exceptions') { try { sendJson(response, 201, await exceptionService.create(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    const exceptionResponseMatch = path.match(/^\/api\/v1\/exceptions\/([^/]+)\/respond$/);
    if (request.method === 'POST' && exceptionResponseMatch) { try { sendJson(response, 200, await exceptionService.respond(decodeURIComponent(exceptionResponseMatch[1]), await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/followup/check') { try { sendJson(response, 200, await followUpMonitor.check(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    const auditRunMatch = path.match(/^\/api\/v1\/audit\/([^/]+)$/);
    const auditExportMatch = path.match(/^\/api\/v1\/audit\/([^/]+)\/export$/);
    if (request.method === 'GET' && auditRunMatch) { try { sendJson(response, 200, await auditService.list(decodeURIComponent(auditRunMatch[1]))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && auditExportMatch) { try { sendJson(response, 200, await auditService.exportPackage({ runId: decodeURIComponent(auditExportMatch[1]) })); } catch (error) { sendDomainError(response, error); } return; }

    if (request.method === 'POST' && path === '/api/v1/onboarding') {
      try {
        sendJson(response, 200, await onboardingService.saveOnboarding(await readJsonBody(request)));
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/resumes/extract') { try { sendJson(response, 200, await resumeService.extract(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/resumes/select') { try { sendJson(response, 200, await resumeService.select(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/jobs/fit') { try { sendJson(response, 200, await resumeService.fit(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/evidence') { try { sendJson(response, 201, await evidenceService.record(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/assessments') { try { sendJson(response, 201, await assessmentService.record(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/assessments/prepare') { try { sendJson(response, 200, await assessmentService.prepare(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'GET' && path === '/api/v1/assessments') { try { sendJson(response, 200, await assessmentService.list()); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/imports/legacy') { try { sendJson(response, 200, await legacyImportService.import(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'GET' && path === '/api/v1/pending') { try { sendJson(response, 200, await pendingService.list(Object.fromEntries(new URL(request.url ?? '/', 'http://127.0.0.1').searchParams))); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'GET' && path === '/api/v1/metrics') { try { sendJson(response, 200, await metricsService.get()); } catch (error) { sendDomainError(response, error); } return; }

    if (request.method === 'GET' && path === '/api/v1/runtime-config') {
      sendJson(response, 200, await readRuntimeConfig(rootDir));
      return;
    }

    if (request.method === 'GET' && path === '/api/v1/codex') { try { sendJson(response, 200, await codexSnapshot(codexHarnessService, codexSettingsService)); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'POST' && path === '/api/v1/codex/refresh') { try { sendJson(response, 200, await codexSnapshot(codexHarnessService, codexSettingsService, true)); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'GET' && path === '/api/v1/codex/settings') { try { sendJson(response, 200, await codexSettingsService.get()); } catch (error) { sendDomainError(response, error); } return; }
    if (request.method === 'PUT' && path === '/api/v1/codex/settings') { try { sendJson(response, 200, await codexSettingsService.update(await readJsonBody(request))); } catch (error) { sendDomainError(response, error); } return; }

    if (request.method === 'GET' && path === '/api/v1/applications') {
      sendJson(response, 200, (await readFluxoState(rootDir)).applications);
      return;
    }

    const applicationEventMatch = path.match(/^\/api\/v1\/applications\/([^/]+)\/events$/);
    if (request.method === 'POST' && applicationEventMatch) {
      try {
        const input = await readJsonBody(request);
        sendJson(response, 201, await followUpService.recordEvent({ reference: decodeURIComponent(applicationEventMatch[1]), ...input }));
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/preflight/run') {
      try {
        const input = await readJsonBody(request);
        sendJson(response, 200, await effectivePreflightService.runPreflight(input));
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/messages/draft') {
      try {
        sendJson(response, 200, await messageService.createDraft(await readJsonBody(request)));
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    const policyApprovalMatch = path.match(/^\/api\/v1\/(assessments|messages)\/approval(?:\/([^/]+)\/assert)?$/);
    if (request.method === 'POST' && policyApprovalMatch) {
      try {
        const input = await readJsonBody(request);
        const isAssessment = policyApprovalMatch[1] === 'assessments';
        const approvalId = policyApprovalMatch[2] ? decodeURIComponent(policyApprovalMatch[2]) : '';
        const result = approvalId
          ? isAssessment
            ? assessmentService.assertTimedTestApproved({ approvalId, payload: input.payload ?? {}, context: sanitizePolicyContext(input.context) })
            : messageService.assertSendApproved({ approvalId, payload: input.payload ?? {}, context: sanitizePolicyContext(input.context) })
          : isAssessment
            ? assessmentService.requestTimedTestApproval({ ...input, context: sanitizePolicyContext(input.context) })
            : messageService.requestSendApproval({ ...input, context: sanitizePolicyContext(input.context) });
        sendJson(response, approvalId ? 200 : 201, result);
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (request.method === 'GET' && path === '/api/v1/queue') {
      try {
        sendJson(response, 200, await queueService.listQueue());
      } catch {
        sendJson(response, 500, { error: { code: 'queue_read_failed', message: 'Não foi possível ler a fila local.' } });
      }
      return;
    }
    if (request.method === 'GET' && path === '/api/v1/queue/search') {
      try { sendJson(response, 200, await queueService.search(Object.fromEntries(new URL(request.url ?? '/', 'http://127.0.0.1').searchParams))); } catch (error) { sendDomainError(response, error); }
      return;
    }

    if (request.method === 'GET' && path === '/api/v1/campaign') {
      sendJson(response, 200, await campaignService.getCampaign());
      return;
    }

    if (request.method === 'PUT' && path === '/api/v1/campaign') {
      try {
        sendJson(response, 200, await campaignService.updateCampaign(await readJsonBody(request)));
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (request.method === 'GET' && path === '/api/v1/platforms') {
      sendJson(response, 200, await campaignService.listPlatforms());
      return;
    }

    const runMatch = path.match(/^\/api\/v1\/runs\/([^/]+)$/);
    if (request.method === 'GET' && runMatch) {
      const run = runService.getRun(decodeURIComponent(runMatch[1]));
      if (!run) {
        sendJson(response, 404, { error: { code: 'run_not_found', message: 'Execução não encontrada.' } });
      } else {
        sendJson(response, 200, run);
      }
      return;
    }

    const runEventsMatch = path.match(/^\/api\/v1\/runs\/([^/]+)\/events$/);
    if (request.method === 'GET' && runEventsMatch) {
      const runId = decodeURIComponent(runEventsMatch[1]);
      if (!runService.getRun(runId)) {
        sendJson(response, 404, { error: { code: 'run_not_found', message: 'Execução não encontrada.' } });
        return;
      }
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      });
      for (const event of runService.listEvents(runId)) {
        response.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${event.payloadJson}\n\n`);
      }
      if (new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('stream') === '1' && runService.subscribe) {
        const unsubscribe = runService.subscribe(runId, (event) => response.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${event.payloadJson}\n\n`));
        request.on('close', unsubscribe);
        return;
      }
      response.end();
      return;
    }

    const agentTurnMatch = path.match(/^\/api\/v1\/runs\/([^/]+)\/agent-turn$/);
    const agentThreadMatch = path.match(/^\/api\/v1\/runs\/([^/]+)\/agent-thread$/);
    if (request.method === 'POST' && agentThreadMatch) {
      try {
        if (!agentAdapter) throw domainError('agent_unavailable', 'App Server local não está configurado.');
        const runId = decodeURIComponent(agentThreadMatch[1]);
        if (!runService.getRun(runId)) throw domainError('run_not_found', 'Execução não encontrada.');
        const result = await agentAdapter.startThread(await readJsonBody(request));
        if (runService.setAgentThread && result?.thread?.id) runService.setAgentThread(runId, result.thread.id);
        const event = runService.appendEvent({ runId, type: 'agent.thread.started', payload: result });
        sendJson(response, 201, { ...result, event });
      } catch (error) { sendDomainError(response, error); }
      return;
    }
    if (request.method === 'POST' && agentTurnMatch) {
      try {
        if (!agentAdapter) throw domainError('agent_unavailable', 'App Server local não está configurado.');
        const runId = decodeURIComponent(agentTurnMatch[1]);
        if (!runService.getRun(runId)) throw domainError('run_not_found', 'Execução não encontrada.');
        const input = await readJsonBody(request);
        const result = await (agentAdapter.runTurnForRun ? agentAdapter.runTurnForRun(runId, String(input.threadId ?? ''), String(input.text ?? '')) : agentAdapter.runTurn(String(input.threadId ?? ''), String(input.text ?? '')));
        if (runService.setCurrentTurn && result?.turn?.id) runService.setCurrentTurn(runId, result.turn.id);
        const event = runService.appendEvent({ runId, type: 'agent.turn.completed', payload: result });
        sendJson(response, 200, { result, event });
      } catch (error) { sendDomainError(response, error); }
      return;
    }

    if (request.method === 'POST' && runEventsMatch) {
      try {
        const input = await readJsonBody(request);
        sendJson(response, 201, runService.appendEvent({ runId: decodeURIComponent(runEventsMatch[1]), ...input }));
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/runs') {
      try {
        const input = await readJsonBody(request);
        sendJson(response, 201, runService.startRun(input));
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/autopilot/start') {
      try {
        sendJson(response, 201, await autopilotService.start(await readJsonBody(request)));
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/applications/prepare') {
      if (!applicationFlow) {
        sendJson(response, 503, { error: { code: 'application_flow_unavailable', message: 'Fluxo de candidatura ainda não está configurado.' } });
        return;
      }
      try {
        const input = await readJsonBody(request);
        if (!input.checkpoint) input.checkpoint = (await readFluxoState(rootDir)).checkpoint;
        const prepared = await applicationFlow.prepareNext(input);
        preparedApplications.set(prepared.run.id, prepared);
        sendJson(response, 201, prepared);
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    const applicationRunMatch = path.match(/^\/api\/v1\/applications\/([^/]+)\/(approval|submit)$/);
    if (request.method === 'POST' && applicationRunMatch) {
      if (!applicationFlow) {
        sendJson(response, 503, { error: { code: 'application_flow_unavailable', message: 'Fluxo de candidatura ainda não está configurado.' } });
        return;
      }
      try {
        const runId = decodeURIComponent(applicationRunMatch[1]);
        const input = await readJsonBody(request);
        if (applicationRunMatch[2] === 'approval') {
          sendJson(response, 201, applicationFlow.requestSubmissionApproval(runId, input));
        } else {
          const prepared = preparedApplications.get(runId);
          if (!prepared) throw domainError('application_context_missing', 'Contexto de candidatura não está disponível para esta execução.');
          const { approvalId, ...payload } = input;
          const result = await applicationFlow.submitApproved(prepared, approvalId, payload);
          preparedApplications.delete(runId);
          sendJson(response, 200, result);
        }
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (request.method === 'GET' && path === '/api/v1/approvals') {
      sendJson(response, 200, approvalService.listApprovals());
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/exports/shareable') {
      try {
        sendJson(response, 200, await exportService.createShareableExport());
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/sync/reconcile') {
      try {
        sendJson(response, 200, await effectiveStateStore.syncFromFiles());
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/approvals') {
      try {
        sendJson(response, 201, approvalService.requestApproval(await readJsonBody(request)));
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    const approvalMatch = path.match(/^\/api\/v1\/approvals\/([^/]+)\/decision$/);
    if (request.method === 'POST' && approvalMatch) {
      try {
        const input = await readJsonBody(request);
        if (input.actorType === 'agent') throw domainError('approval_decision_forbidden', 'Agentes não podem decidir aprovações.');
        sendJson(response, 200, approvalService.decideApproval(decodeURIComponent(approvalMatch[1]), input, actorResolver({ request, authorization })));
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    const approvalPreviewMatch = path.match(/^\/api\/v1\/approvals\/([^/]+)\/preview$/);
    if (request.method === 'POST' && approvalPreviewMatch) {
      try { sendJson(response, 200, approvalService.preview(decodeURIComponent(approvalPreviewMatch[1]), await readJsonBody(request))); } catch (error) { sendDomainError(response, error); }
      return;
    }

    const runActionMatch = path.match(/^\/api\/v1\/runs\/([^/]+)\/(interrupt|resume)$/);
    if (request.method === 'POST' && runActionMatch) {
      try {
        const id = decodeURIComponent(runActionMatch[1]);
        const run = runActionMatch[2] === 'interrupt'
          ? runService.pauseRun(id, 'interrompido pelo usuário')
          : runService.resumeRun(id);
        sendJson(response, 200, run);
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/queue/items') {
      try {
        const item = await queueService.addQueueItem(await readJsonBody(request));
        sendJson(response, 201, item);
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    const claimMatch = path.match(/^\/api\/v1\/queue\/([^/]+)\/claim$/);
    if (request.method === 'POST' && claimMatch) {
      try {
        const item = await queueService.claimNext({ id: decodeURIComponent(claimMatch[1]) });
        sendJson(response, 200, item);
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    const failureMatch = path.match(/^\/api\/v1\/queue\/([^/]+)\/failure$/);
    if (request.method === 'POST' && failureMatch) {
      try {
        const input = await readJsonBody(request);
        sendJson(response, 200, await queueService.recordQueueFailure(decodeURIComponent(failureMatch[1]), input.errorMessage));
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (STATIC_FILES.has(path) && request.method !== 'GET') {
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } });
      return;
    }

    const knownPath = path === '/health' || path === '/api/v1/state' || path === '/api/v1/state/preflight' || path === '/api/v1/state/checkpoint' || path === '/api/v1/profile' || path === '/api/v1/onboarding' || path === '/api/v1/resumes/extract' || path === '/api/v1/resumes/select' || path === '/api/v1/jobs/fit' || path === '/api/v1/evidence' || path === '/api/v1/assessments' || path === '/api/v1/assessments/prepare' || path === '/api/v1/imports/legacy' || path === '/api/v1/pending' || path === '/api/v1/metrics' || path === '/api/v1/runtime-config' || path === '/api/v1/applications' || path === '/api/v1/preflight/run' || path === '/api/v1/messages/draft' || path === '/api/v1/queue' || path === '/api/v1/queue/search' || path === '/api/v1/memory' || path === '/api/v1/intake/preview' || path === '/api/v1/intake/commit' || path === '/api/v1/discovery' || path === '/api/v1/discovery/resume' || path === '/api/v1/fit' || path === '/api/v1/fit/override' || path === '/api/v1/exceptions' || path === '/api/v1/followup/check'
      || path === '/api/v1/queue/items' || path === '/api/v1/runs' || path === '/api/v1/autopilot/start' || path === '/api/v1/approvals' || path === '/api/v1/exports/shareable' || path === '/api/v1/sync/reconcile' || path === '/api/v1/applications/prepare'
      || path === '/api/v1/campaign' || path === '/api/v1/platforms' || path === '/api/v1/observability' || path === '/api/v1/operations' || path === '/api/v1/auth/session' || path === '/api/v1/auth/openai' || path === '/api/v1/auth/openai/login' || path === '/api/v1/auth/openai/logout' || path === '/api/v1/codex' || path === '/api/v1/codex/refresh' || path === '/api/v1/codex/settings' || Boolean(claimMatch) || Boolean(failureMatch) || Boolean(runMatch) || Boolean(runActionMatch) || Boolean(runEventsMatch) || Boolean(approvalMatch) || Boolean(approvalPreviewMatch) || Boolean(policyApprovalMatch) || Boolean(applicationEventMatch) || Boolean(applicationRunMatch) || Boolean(agentTurnMatch) || Boolean(agentThreadMatch) || Boolean(memoryFactMatch) || Boolean(exceptionResponseMatch) || Boolean(auditRunMatch) || Boolean(auditExportMatch);
    if (knownPath) {
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'POST') {
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } });
      return;
    }

    const staticFile = STATIC_FILES.get(path);
    if (request.method === 'GET' && staticFile) {
      try {
        if (path === '/') sessionAuth.bootstrap(response);
        const body = await readFile(new URL(staticFile[0], PUBLIC_DIR));
        response.writeHead(200, {
          'content-type': staticFile[1],
          'cache-control': 'no-store'
        });
        response.end(body);
      } catch {
        sendJson(response, 500, {
          error: { code: 'asset_read_failed', message: 'Não foi possível carregar a interface local.' }
        });
      }
      return;
    }

    sendJson(response, 404, { error: { code: 'not_found', message: 'Recurso não encontrado.' } });
  });
  server.once('close', () => {
    if (ownsStateStore) effectiveStateStore.close();
    if (ownsApprovalService) approvalService.close();
    if (ownsRunService) runService.close();
  });
  return server;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, JSON_HEADERS);
  const body = response.__mutationEnvelope && statusCode < 400 && payload && typeof payload === 'object' && !Array.isArray(payload)
    ? { ...payload, request_id: response.getHeader('x-request-id'), event_ids: payload.event_ids ?? [], state: payload.state ?? payload, data: payload }
    : payload;
  response.end(JSON.stringify(body));
}

function sendDomainError(response, error) {
  const statusCode = error?.code === 'queue_item_not_found' || error?.code === 'run_not_found' || error?.code === 'approval_not_found' ? 404
    : error?.code === 'fluxo_locked' || error?.code === 'aggregate_blocked' || error?.code?.startsWith('queue_') || error?.code?.startsWith('approval_') || error?.code === 'run_not_resumable' ? 409 : 400;
  sendJson(response, statusCode, {
    error: { code: error?.code ?? 'request_failed', message: error?.message ?? 'Não foi possível concluir a operação.', retryable: statusCode >= 500 || error?.code === 'fluxo_locked', actionRequired: statusCode === 401 ? 'authenticate' : statusCode === 403 ? 'confirm' : 'review', request_id: response.getHeader('x-request-id') }
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) reject(Object.assign(new Error('Payload muito grande.'), { code: 'payload_too_large' }));
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error('JSON inválido.'), { code: 'invalid_json' }));
      }
    });
    request.on('error', reject);
  });
}

function mutationTargets(rootDir, path) {
  const relative = path === '/api/v1/onboarding' ? ['perfil/candidato.md', 'campanha/config.json']
    : path === '/api/v1/campaign' ? ['campanha/config.json']
      : path.startsWith('/api/v1/queue/') ? ['fila/vagas.json']
        : path.startsWith('/api/v1/applications/') ? ['candidaturas/candidaturas.json']
          : path === '/api/v1/state/checkpoint' ? ['estado/checkpoint.json'] : [];
  return relative.map((item) => join(rootDir, item));
}

function sanitizePolicyContext(context = {}) {
  const sanitized = {};
  if (['captcha', 'mfa', 'biometric'].includes(context.browserChallenge)) sanitized.browserChallenge = context.browserChallenge;
  for (const key of ['sensitiveConfirmed', 'requireFinalConfirmation', 'allowAutomatedSubmission']) {
    if (typeof context[key] === 'boolean') sanitized[key] = context[key];
  }
  return sanitized;
}

function hashTargets(paths) {
  const hash = createHash('sha256'); let found = false;
  for (const path of paths) if (existsSync(path)) { found = true; hash.update(readFileSync(path)); }
  return found ? hash.digest('hex') : '';
}

async function codexSnapshot(harness, settings, refresh = false) { const snapshot = refresh && harness.refresh ? await harness.refresh() : await harness.snapshot(); return { ...snapshot, settings: await settings.get() }; }
function createUnavailableCodexHarness() { const value = { status: 'unavailable', account: null, usage: null, rateLimits: null, models: [], error: { code: 'agent_unavailable', message: 'Codex app-server local não está configurado.' } }; return { async snapshot() { return value; }, async refresh() { return value; } }; }
