import { PRODUCT_POLICY, campaignLimitsFrom } from './product-policy.mjs';
import { buildSubmissionReview } from './review-service.mjs';
import { createRecoveryGuidance } from './recovery-service.mjs';
import { resolveAiMode } from './ai-modes.mjs';

export function createFinalReleaseRoutes({
  resumeImportService, memoryService, schedulerService, notificationService,
  runtimeHealth, orchestrator, campaignService, runtimeConfig, sessionStore
} = {}) {
  return async function handle(request, response, { path, sendJson, sendDomainError, readJsonBody }) {
    try {
      if (request.method === 'POST' && path === '/api/v1/resumes/import') {
        sendJson(response, 201, await resumeImportService.importFile(await readJsonBody(request)));
        return true;
      }
      if (request.method === 'POST' && path === '/api/v1/memory/answers') {
        sendJson(response, 200, { answers: await memoryService.recordAnswers((await readJsonBody(request)).answers ?? {}) });
        return true;
      }
      if (request.method === 'GET' && path === '/api/v1/runtime/health') {
        sendJson(response, 200, await runtimeHealth.snapshot());
        return true;
      }
      if (request.method === 'GET' && path === '/api/v1/product/policy') {
        sendJson(response, 200, { policy: PRODUCT_POLICY, limits: campaignLimitsFrom(runtimeConfig), lifecycle: 'A agenda funciona enquanto o aplicativo estiver aberto e retoma ao reabrir. Não há execução com o computador desligado.' });
        return true;
      }
      if (request.method === 'GET' && path === '/api/v1/ai/mode') {
        const health = await runtimeHealth.snapshot();
        sendJson(response, 200, resolveAiMode({ requested: health.available ? 'codex-app-server' : 'offline-read', runtime: { available: health.available, mode: health.available ? 'codex-app-server' : 'offline-read' } }));
        return true;
      }
      if (request.method === 'POST' && path === '/api/v1/scheduler/jobs') {
        sendJson(response, 201, await schedulerService.schedule(await readJsonBody(request)));
        return true;
      }
      if (request.method === 'GET' && path === '/api/v1/scheduler/jobs') {
        sendJson(response, 200, await schedulerService.list());
        return true;
      }
      if (request.method === 'POST' && path === '/api/v1/notifications') {
        sendJson(response, 201, await notificationService.notify(await readJsonBody(request)));
        return true;
      }
      if (request.method === 'GET' && path === '/api/v1/notifications') {
        sendJson(response, 200, await notificationService.list());
        return true;
      }
      const openMatch = path.match(/^\/api\/v1\/notifications\/([^/]+)\/open$/);
      if (request.method === 'POST' && openMatch) {
        sendJson(response, 200, await notificationService.open(decodeURIComponent(openMatch[1])));
        return true;
      }
      const continueMatch = path.match(/^\/api\/v1\/autopilot\/([^/]+)\/continue$/);
      if (request.method === 'POST' && continueMatch) {
        sendJson(response, 200, await orchestrator.continue(decodeURIComponent(continueMatch[1]), await readJsonBody(request)));
        return true;
      }
      if (request.method === 'POST' && path === '/api/v1/autopilot/human') {
        sendJson(response, 200, await orchestrator.handleHumanEvent(await readJsonBody(request)));
        return true;
      }
      const cancelMatch = path.match(/^\/api\/v1\/autopilot\/([^/]+)\/cancel$/);
      if (request.method === 'POST' && cancelMatch) {
        sendJson(response, 200, orchestrator.cancel(decodeURIComponent(cancelMatch[1])));
        return true;
      }
      if (request.method === 'GET' && path === '/api/v1/reviews/preview') {
        sendJson(response, 200, buildSubmissionReview(await readJsonQuery(request)));
        return true;
      }
      if (request.method === 'POST' && path === '/api/v1/recovery/guide') {
        sendJson(response, 200, createRecoveryGuidance(await readJsonBody(request)));
        return true;
      }
      if (request.method === 'POST' && path === '/api/v1/sessions') {
        sendJson(response, 200, await sessionStore.save(await readJsonBody(request)));
        return true;
      }
      if (request.method === 'GET' && path === '/api/v1/campaign/limits') {
        sendJson(response, 200, { ...(await campaignService.getCampaign()), limits: campaignLimitsFrom(runtimeConfig) });
        return true;
      }
    } catch (error) {
      sendDomainError(response, error);
      return true;
    }
    return false;
  };
}

function readJsonQuery(request) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  return Object.fromEntries(url.searchParams);
}
