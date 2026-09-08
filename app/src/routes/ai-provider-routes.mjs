import { readJsonBody, respond, sendJson } from './http-helpers.mjs';

const PATH = '/api/v1/ai/provider';

export function createAiProviderRoutes({ providerService = null, conversationService = null } = {}) {
  return {
    knows: (path) => path === PATH,
    async handle(request, response, { path }) {
      if (path !== PATH) return false;
      if (!providerService) {
        sendJson(response, 503, { error: { code: 'conversation_provider_unavailable', message: 'A escolha de IA não está disponível.' } });
        return true;
      }
      if (request.method === 'GET') return respond(response, 200, async () => {
        await providerService.load();
        return providerService.snapshot();
      });
      if (request.method === 'PUT') return respond(response, 200, async () => {
        const { provider } = await readJsonBody(request);
        if (conversationService?.selectProvider) return conversationService.selectProvider(provider);
        return providerService.set(provider);
      });
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } });
      return true;
    }
  };
}
