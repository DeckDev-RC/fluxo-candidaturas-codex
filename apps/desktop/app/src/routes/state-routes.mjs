import { readFluxoState } from '../state-reader.mjs';
import { getFluxoProfileSummary } from '../profile-service.mjs';
import { readRuntimeConfig } from '../runtime-config.mjs';
import { queryOf, readJsonBody, respond, sendJson } from './http-helpers.mjs';

// Leitura de estado, perfil, preparação do ambiente e métricas.
const CAMINHOS = new Set([
  '/health', '/api/v1/state', '/api/v1/state/preflight', '/api/v1/state/checkpoint', '/api/v1/profile',
  '/api/v1/runtime-config', '/api/v1/observability', '/api/v1/operations', '/api/v1/applications',
  '/api/v1/preflight/run', '/api/v1/metrics', '/api/v1/pending'
]);

export function createStateRoutes({ rootDir, checkpointService, preflightService, metricsService, pendingService, observability, stateStore }) {
  return {
    knows: (path) => CAMINHOS.has(path),
    async handle(request, response, { path }) {
      const method = request.method;
      if (method === 'GET' && path === '/health') { sendJson(response, 200, { ok: true }); return true; }
      if (method === 'GET' && path === '/api/v1/observability') { sendJson(response, 200, observability.snapshot()); return true; }
      if (method === 'GET' && path === '/api/v1/operations') { sendJson(response, 200, stateStore.listOperations ? stateStore.listOperations() : []); return true; }

      if (method === 'GET' && path === '/api/v1/state') {
        try { sendJson(response, 200, await readFluxoState(rootDir)); }
        catch { sendJson(response, 500, { error: { code: 'state_read_failed', message: 'Não foi possível ler o estado local do Fluxo.' } }); }
        return true;
      }
      if (method === 'GET' && path === '/api/v1/state/preflight') { sendJson(response, 200, (await readFluxoState(rootDir)).preflight); return true; }
      if (method === 'GET' && path === '/api/v1/state/checkpoint') { sendJson(response, 200, (await readFluxoState(rootDir)).checkpoint); return true; }
      if (method === 'POST' && path === '/api/v1/state/checkpoint') return respond(response, 200, async () => checkpointService.save(await readJsonBody(request)));
      if (method === 'DELETE' && path === '/api/v1/state/checkpoint') return respond(response, 200, () => checkpointService.clear());
      if (method === 'GET' && path === '/api/v1/profile') { sendJson(response, 200, await getFluxoProfileSummary(rootDir)); return true; }
      if (method === 'GET' && path === '/api/v1/runtime-config') { sendJson(response, 200, await readRuntimeConfig(rootDir)); return true; }
      if (method === 'GET' && path === '/api/v1/applications') { sendJson(response, 200, (await readFluxoState(rootDir)).applications); return true; }
      if (method === 'POST' && path === '/api/v1/preflight/run') return respond(response, 200, async () => preflightService.runPreflight(await readJsonBody(request)));
      if (method === 'GET' && path === '/api/v1/metrics') return respond(response, 200, () => metricsService.get());
      if (method === 'GET' && path === '/api/v1/pending') return respond(response, 200, () => pendingService.list(queryOf(request)));
      return false;
    }
  };
}
