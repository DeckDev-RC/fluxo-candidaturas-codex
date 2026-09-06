import { createPersistenceAuthority } from '../persistence-authority.mjs';
import { domainError, queryOf, readJsonBody, respond, sendJson } from './http-helpers.mjs';

// Campanha, fila de oportunidades, plataformas, exportação e persistência.
const CAMINHOS = new Set([
  '/api/v1/queue', '/api/v1/queue/search', '/api/v1/queue/items', '/api/v1/queue/discard', '/api/v1/campaign', '/api/v1/platforms',
  '/api/v1/exports/shareable', '/api/v1/sync/reconcile'
]);
const PADROES = [
  /^\/api\/v1\/queue\/([^/]+)\/claim$/,
  /^\/api\/v1\/queue\/([^/]+)\/failure$/
];

export function createCampaignRoutes({ rootDir, queueService, campaignService, exportService, stateStore }) {
  return {
    knows: (path) => CAMINHOS.has(path) || PADROES.some((padrao) => padrao.test(path)),
    async handle(request, response, { path }) {
      const method = request.method;

      if (method === 'GET' && path === '/api/v1/queue') {
        try { sendJson(response, 200, await queueService.listQueue()); }
        catch { sendJson(response, 500, { error: { code: 'queue_read_failed', message: 'Não foi possível ler a fila local.' } }); }
        return true;
      }
      if (method === 'GET' && path === '/api/v1/queue/search') return respond(response, 200, () => queueService.search(queryOf(request)));
      if (method === 'POST' && path === '/api/v1/queue/items') return respond(response, 201, async () => queueService.addQueueItem(await readJsonBody(request)));
      if (method === 'POST' && path === '/api/v1/queue/discard') return respond(response, 200, async () => queueService.discardItems(await readJsonBody(request)));
      const reserva = path.match(PADROES[0]);
      if (method === 'POST' && reserva) return respond(response, 200, () => queueService.claimNext({ id: decodeURIComponent(reserva[1]) }));
      const falha = path.match(PADROES[1]);
      if (method === 'POST' && falha) return respond(response, 200, async () => queueService.recordQueueFailure(decodeURIComponent(falha[1]), (await readJsonBody(request)).errorMessage));

      if (method === 'GET' && path === '/api/v1/campaign') { sendJson(response, 200, await campaignService.getCampaign()); return true; }
      if (method === 'PUT' && path === '/api/v1/campaign') return respond(response, 200, async () => campaignService.updateCampaign(await readJsonBody(request)));
      if (method === 'GET' && path === '/api/v1/platforms') { sendJson(response, 200, await campaignService.listPlatforms()); return true; }
      if (method === 'POST' && path === '/api/v1/exports/shareable') return respond(response, 200, () => exportService.createShareableExport());
      if (method === 'POST' && path === '/api/v1/sync/reconcile') return respond(response, 200, () => stateStore.syncFromFiles());

      if (path.startsWith('/api/v1/persistence') && ['GET', 'POST'].includes(method)) {
        const persistence = createPersistenceAuthority({ rootDir });
        try {
          await respond(response, 200, async () => {
            const input = method === 'POST' ? await readJsonBody(request) : {};
            if (method === 'GET' && path === '/api/v1/persistence') return { mode: await persistence.getMode(), divergences: await persistence.detectLegacyDrift() };
            if (path === '/api/v1/persistence/migrate') return persistence.migrateLegacy();
            if (path === '/api/v1/persistence/reconcile') return persistence.reconcileLegacy(input);
            if (path === '/api/v1/persistence/export') { persistence.assertNoDrift(); return persistence.exportCompatibility(); }
            throw domainError('not_found', 'Operação de persistência desconhecida.');
          });
        } finally { persistence.close(); }
        return true;
      }
      return false;
    }
  };
}
