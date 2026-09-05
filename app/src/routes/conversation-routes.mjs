import { readJsonBody, respond, sendJson } from './http-helpers.mjs';

// Conversa com o Fluxo: um turno real no Codex por mensagem. Sem serviço de
// conversa (IA ausente), a rota diz isso em vez de fingir resposta.
const CAMINHOS = new Set(['/api/v1/conversation/turn', '/api/v1/conversation/reset']);

export function createConversationRoutes({ conversationService = null } = {}) {
  return {
    knows: (path) => CAMINHOS.has(path),
    async handle(request, response, { path }) {
      if (!CAMINHOS.has(path)) return false;
      if (request.method !== 'POST') { sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } }); return true; }
      if (!conversationService) {
        sendJson(response, 503, { error: { code: 'agent_unavailable', message: 'A conversa com a IA não está disponível nesta instalação.' } });
        return true;
      }
      if (path === '/api/v1/conversation/reset') return respond(response, 200, async () => { await conversationService.reset(); return { reset: true }; });
      return respond(response, 200, async () => conversationService.turn(String((await readJsonBody(request)).text ?? '')));
    }
  };
}
