import { createServer as createHttpServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { acquireFluxoLock } from './lock.mjs';
import { isLocalRequest } from './local-auth.mjs';
import { createFinalReleaseRoutes } from './final-release-routes.mjs';
import { resolveServerServices } from './routes/server-services.mjs';
import { createStateRoutes } from './routes/state-routes.mjs';
import { createKnowledgeRoutes } from './routes/knowledge-routes.mjs';
import { createCampaignRoutes } from './routes/campaign-routes.mjs';
import { createExecutionRoutes } from './routes/execution-routes.mjs';
import { createCodexRoutes } from './routes/codex-routes.mjs';
import { readJsonBody, sendDomainError, sendJson } from './routes/http-helpers.mjs';

// O servidor cuida só de transporte: origem local, sessão, trava de mutação,
// registro de operação, arquivos da interface e despacho para os grupos de rota.
// Regra de negócio vive nos serviços; formato de rota vive em routes/.

const PUBLIC_DIR = new URL('../public/', import.meta.url);

const STATIC_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.json', 'application/json; charset=utf-8']
]);

// A interface é modular: servimos a pasta pública com nome restrito e extensão
// conhecida. Nenhum caminho relativo escapa da pasta.
export function resolveStaticAsset(path) {
  const requested = path === '/' ? 'index.html' : String(path ?? '').replace(/^\/+/, '');
  if (!/^[A-Za-z0-9._/-]+$/.test(requested) || requested.includes('..')) return null;
  const type = STATIC_TYPES.get(requested.slice(requested.lastIndexOf('.')).toLowerCase());
  return type ? [requested, type] : null;
}

const PUBLICOS = new Set(['/health', '/', '/api/v1/auth/session']);
const METODOS_MUTACAO = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createServer(options) {
  const { rootDir } = options;
  mkdirSync(join(rootDir, 'estado'), { recursive: true });
  const s = resolveServerServices(options);

  const grupos = [
    createFinalReleaseRoutes({
      resumeImportService: s.resumeImportService, memoryService: s.memoryService, schedulerService: s.schedulerService,
      notificationService: s.notificationService, runtimeHealth: s.runtimeHealth, orchestrator: s.orchestrator,
      campaignService: s.campaignService, runtimeConfig: {}, sessionStore: s.sessionStore, budget: s.budget,
      consistencyService: s.consistencyService
    }),
    createStateRoutes({ rootDir, checkpointService: s.checkpointService, preflightService: s.preflightService, metricsService: s.metricsService, pendingService: s.pendingService, observability: s.observability, stateStore: s.stateStore }),
    createCodexRoutes({ sessionAuth: s.sessionAuth, authService: s.authService, codexHarnessService: s.codexHarnessService, codexSettingsService: s.codexSettingsService }),
    createKnowledgeRoutes(s),
    createCampaignRoutes({ rootDir, queueService: s.queueService, campaignService: s.campaignService, exportService: s.exportService, stateStore: s.stateStore }),
    createExecutionRoutes({ rootDir, runService: s.runService, approvalService: s.approvalService, applicationFlow: s.applicationFlow, autopilotService: s.autopilotService, agentAdapter: s.agentAdapter, followUpService: s.followUpService, memoryService: s.memoryService, actorResolver: s.actorResolver })
  ];

  // Serviços que já tratam a própria trava de mutação não passam pela trava do servidor.
  // Login e logout do Codex não tocam os dados do Fluxo e podem esperar o usuário no
  // navegador: segurar a trava aqui bloquearia todo o resto durante o login.
  const travaDoServico = (path) => path.startsWith('/api/v1/auth/openai/')
    || (path.startsWith('/api/v1/queue/') && s.queueService.handlesMutationLock)
    || (path === '/api/v1/campaign' && s.campaignService.handlesMutationLock)
    || (path === '/api/v1/onboarding' && s.onboardingService.handlesMutationLock)
    || (path === '/api/v1/state/checkpoint' && s.checkpointService.handlesMutationLock)
    || (path === '/api/v1/evidence' && s.evidenceService.handlesMutationLock)
    || (path.startsWith('/api/v1/assessments') && s.assessmentService.handlesMutationLock)
    || (path === '/api/v1/imports/legacy' && s.legacyImportService.handlesMutationLock)
    || (/^\/api\/v1\/applications\/[^/]+\/events$/.test(path) && s.followUpService.handlesMutationLock)
    || (path === '/api/v1/messages/draft' && s.messageService.handlesMutationLock)
    || (path.startsWith('/api/v1/memory') && s.memoryService.handlesMutationLock)
    || (path === '/api/v1/intake/commit' && s.memoryService.handlesMutationLock)
    || (path.startsWith('/api/v1/exceptions') && s.exceptionService.handlesMutationLock)
    || (path.startsWith('/api/v1/discovery') && s.discoveryService.handlesMutationLock);

  const server = createHttpServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const requestId = randomUUID();
    const startedAt = Date.now();
    response.setHeader('x-request-id', requestId);
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'");
    response.setHeader('x-content-type-options', 'nosniff');
    response.once('finish', () => s.observability.record({ method: request.method, path, status: response.statusCode, durationMs: Date.now() - startedAt }));

    if (!isLocalRequest(request)) { sendJson(response, 403, { error: { code: 'local_auth_required', message: 'Apenas conexões locais são permitidas.' } }); return; }
    const isMutation = METODOS_MUTACAO.has(request.method);
    const authorization = s.sessionAuth.authorize(request, { mutation: isMutation });
    if (!PUBLICOS.has(path) && !authorization.ok) {
      sendJson(response, authorization.status, { error: { code: authorization.code, message: authorization.message, retryable: false, actionRequired: 'authenticate', request_id: requestId } });
      return;
    }

    if (isMutation && !travaDoServico(path)) {
      try { await travarMutacao(rootDir, response); }
      catch (error) { sendDomainError(response, error); return; }
    }
    if (isMutation) {
      response.__mutationEnvelope = true;
      if (s.stateStore.isAggregateBlocked?.('http', path)) {
        sendDomainError(response, Object.assign(new Error('A mutação aguarda reconciliação.'), { code: 'aggregate_blocked' }));
        return;
      }
      registrarOperacao(rootDir, request, response, path, s.stateStore);
    }

    const contexto = { path, authorization, sendJson, sendDomainError, readJsonBody };
    for (const grupo of grupos) {
      if (await grupo.handle(request, response, contexto)) return;
    }

    if (conhecida(path, grupos) || resolveStaticAsset(path)) {
      if (request.method === 'GET' && resolveStaticAsset(path)) return servirArquivo(path, response, s.sessionAuth);
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } });
      return;
    }
    if (request.method !== 'GET' && request.method !== 'POST') {
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } });
      return;
    }
    sendJson(response, 404, { error: { code: 'not_found', message: 'Recurso não encontrado.' } });
  });

  server.once('close', () => { for (const service of s.owned) service.close?.(); });
  return server;
}

// Rota que existe mas não aceita o método recebe 405, não 404.
function conhecida(path, grupos) {
  return grupos.some((grupo) => grupo.knows?.(path));
}

async function travarMutacao(rootDir, response) {
  const releaseLock = await acquireFluxoLock(rootDir);
  let released = false;
  const release = async () => { if (released) return; released = true; await releaseLock(); };
  response.once('finish', release);
  response.once('close', release);
}

// Toda mutação deixa um registro com hash antes/depois dos arquivos que pode tocar.
function registrarOperacao(rootDir, request, response, path, stateStore) {
  if (!stateStore.startOperation || !stateStore.updateOperation) return;
  const targets = mutationTargets(rootDir, path);
  for (const target of targets) if (existsSync(target)) copyFileSync(target, `${target}.bak`);
  const operation = stateStore.startOperation({ kind: `${request.method} ${path}`, aggregateType: 'http', aggregateId: path, input: {}, beforeHash: hashTargets(targets) });
  stateStore.updateOperation(operation.id, { status: 'running' });
  response.once('finish', () => stateStore.updateOperation(operation.id, {
    status: response.statusCode >= 500 ? 'needs_reconcile' : response.statusCode >= 400 ? 'failed' : 'succeeded',
    afterHash: hashTargets(targets),
    blocked: response.statusCode >= 500,
    finishedAt: new Date().toISOString()
  }));
}

async function servirArquivo(path, response, sessionAuth) {
  const [relative, type] = resolveStaticAsset(path);
  try {
    if (path === '/') sessionAuth.bootstrap(response);
    const body = await readFile(new URL(relative, PUBLIC_DIR));
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(body);
  } catch (error) {
    if (error?.code === 'ENOENT') { sendJson(response, 404, { error: { code: 'not_found', message: 'Recurso não encontrado.' } }); return; }
    sendJson(response, 500, { error: { code: 'asset_read_failed', message: 'Não foi possível carregar a interface local.' } });
  }
}

function mutationTargets(rootDir, path) {
  const relative = path === '/api/v1/onboarding' ? ['perfil/candidato.md', 'campanha/config.json']
    : path === '/api/v1/campaign' ? ['campanha/config.json']
      : path.startsWith('/api/v1/queue/') ? ['fila/vagas.json']
        : path.startsWith('/api/v1/applications/') ? ['candidaturas/candidaturas.json']
          : path === '/api/v1/state/checkpoint' ? ['estado/checkpoint.json'] : [];
  return relative.map((item) => join(rootDir, item));
}

function hashTargets(paths) {
  const hash = createHash('sha256');
  let found = false;
  for (const path of paths) if (existsSync(path)) { found = true; hash.update(readFileSync(path)); }
  return found ? hash.digest('hex') : '';
}
