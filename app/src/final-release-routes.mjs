import { PRODUCT_POLICY, campaignLimitsFrom } from './product-policy.mjs';
import { buildSubmissionReview } from './review-service.mjs';
import { createRecoveryGuidance } from './recovery-service.mjs';
import { assertNoSilentFallback, resolveAiMode } from './ai-modes.mjs';

// Rotas da versão final: importação, memória, agenda, notificações, jornada,
// revisão, recuperação, sessões, consistência e limites.
const CAMINHOS = new Set([
  '/api/v1/resumes/import', '/api/v1/memory/answers', '/api/v1/runtime/health', '/api/v1/product/policy',
  '/api/v1/ai/mode', '/api/v1/scheduler/jobs', '/api/v1/notifications', '/api/v1/autopilot/human',
  '/api/v1/reviews/preview', '/api/v1/recovery/guide', '/api/v1/sessions', '/api/v1/consistency', '/api/v1/campaign/limits'
]);
const PADROES = [
  /^\/api\/v1\/memory\/conflicts\/([^/]+)\/resolve$/,
  /^\/api\/v1\/notifications\/([^/]+)\/open$/,
  /^\/api\/v1\/autopilot\/([^/]+)\/continue$/,
  /^\/api\/v1\/autopilot\/([^/]+)\/cancel$/,
  /^\/api\/v1\/scheduler\/jobs\/([^/]+)$/
];

export function createFinalReleaseRoutes(services = {}) {
  return {
    knows: (path) => CAMINHOS.has(path) || PADROES.some((padrao) => padrao.test(path)),
    handle: createHandler(services)
  };
}

function createHandler({
  resumeImportService, memoryService, schedulerService, notificationService,
  runtimeHealth, orchestrator, campaignService, runtimeConfig, sessionStore,
  consistencyService, budget
}) {
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
      const conflitoMatch = path.match(/^\/api\/v1\/memory\/conflicts\/([^/]+)\/resolve$/);
      if (request.method === 'POST' && conflitoMatch) {
        const { value } = await readJsonBody(request);
        sendJson(response, 200, { conflicts: await memoryService.resolveConflict(decodeURIComponent(conflitoMatch[1]), value) });
        return true;
      }
      if (request.method === 'GET' && path === '/api/v1/runtime/health') {
        if (new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('stream') === '1') return transmitirSaude(request, response, runtimeHealth);
        sendJson(response, 200, await runtimeHealth.snapshot());
        return true;
      }
      if (request.method === 'GET' && path === '/api/v1/product/policy') {
        sendJson(response, 200, { policy: PRODUCT_POLICY, limits: campaignLimitsFrom(runtimeConfig), lifecycle: 'A agenda funciona enquanto o aplicativo estiver aberto e retoma ao reabrir. Não há execução com o computador desligado.' });
        return true;
      }
      if (request.method === 'GET' && path === '/api/v1/ai/mode') {
        const health = await runtimeHealth.snapshot();
        const solicitado = health.available ? 'codex-app-server' : 'offline-read';
        const resolvido = resolveAiMode({ requested: solicitado, runtime: { available: health.available, mode: solicitado } });
        // Trocar de modo é decisão explícita: uma mudança silenciosa entre consultas é recusada.
        assertNoSilentFallback({ from: solicitado, to: resolvido.mode });
        sendJson(response, 200, { ...resolvido, state: health.state, message: health.message });
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
      const agendaMatch = path.match(/^\/api\/v1\/scheduler\/jobs\/([^/]+)$/);
      if (request.method === 'DELETE' && agendaMatch) {
        sendJson(response, 200, await schedulerService.remove(decodeURIComponent(agendaMatch[1])));
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
      if (request.method === 'GET' && path === '/api/v1/consistency') {
        if (!consistencyService) {
          sendJson(response, 200, { consistent: true, divergences: [], available: false });
          return true;
        }
        sendJson(response, 200, { available: true, ...(await consistencyService.report()) });
        return true;
      }
      if (request.method === 'GET' && path === '/api/v1/campaign/limits') {
        // O consumo medido acompanha o limite: um teto sem leitura não protege nada.
        sendJson(response, 200, {
          ...(await campaignService.getCampaign()),
          limits: campaignLimitsFrom(runtimeConfig),
          usage: budget?.snapshot ? budget.snapshot() : { measured: false, reason: 'Nenhum orçamento de campanha ativo nesta sessão.' }
        });
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

// Saúde do runtime em tempo real: retrato atual primeiro e, a cada mudança de
// conta (login concluído, logout), um retrato novo. Um comentário periódico
// mantém a conexão viva sem inventar estado.
const BATIMENTO_MS = 25_000;

async function transmitirSaude(request, response, runtimeHealth) {
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const escrever = (saude) => response.write(`event: runtime.health\ndata: ${JSON.stringify(comModo(saude))}\n\n`);
  escrever(await runtimeHealth.snapshot());
  const cancelar = runtimeHealth.onChange?.(escrever) ?? (() => {});
  const batimento = setInterval(() => response.write(': vivo\n\n'), BATIMENTO_MS);
  request.on('close', () => { cancelar(); clearInterval(batimento); });
  return true;
}

// O modo anunciado acompanha a disponibilidade, como em GET /api/v1/ai/mode.
function comModo(saude) {
  return { ...saude, mode: saude.available ? 'codex-app-server' : 'offline-read' };
}
