import { readJsonBody, respond, sendJson } from './http-helpers.mjs';

// Conversa com o Fluxo: turno assíncrono, eventos em tempo real, interrupção e
// reinício. Sem serviço de conversa (IA ausente), a rota diz isso em vez de
// fingir resposta.
const CAMINHOS = new Set(['/api/v1/conversation/turn', '/api/v1/conversation/interrupt', '/api/v1/conversation/reset', '/api/v1/conversation/events', '/api/v1/conversation/status']);
const BATIMENTO_MS = 25_000;

export function createConversationRoutes({ conversationService = null } = {}) {
  return {
    knows: (path) => CAMINHOS.has(path),
    async handle(request, response, { path }) {
      if (!CAMINHOS.has(path)) return false;
      if (!conversationService) {
        sendJson(response, 503, { error: { code: 'agent_unavailable', message: 'A conversa com a IA não está disponível nesta instalação.' } });
        return true;
      }
      if (request.method === 'GET' && path === '/api/v1/conversation/events') return transmitir(request, response, conversationService);
      if (request.method === 'GET' && path === '/api/v1/conversation/status') { sendJson(response, 200, conversationService.status()); return true; }
      if (request.method !== 'POST') { sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } }); return true; }
      if (path === '/api/v1/conversation/reset') return respond(response, 200, async () => { await conversationService.reset(); return { reset: true }; });
      if (path === '/api/v1/conversation/interrupt') return respond(response, 200, () => conversationService.interrupt());
      return respond(response, 202, async () => {
        const corpo = await readJsonBody(request);
        return conversationService.turn(String(corpo.text ?? ''), { system: corpo.system === true });
      });
    }
  };
}

// Histórico recente primeiro e, com `stream=1`, os eventos novos em tempo real.
function transmitir(request, response, conversationService) {
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
  response.write(': conectado\n\n');
  const escrever = (evento) => response.write(`id: ${evento.id}\nevent: ${evento.type}\ndata: ${JSON.stringify(evento)}\n\n`);
  const desde = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('desde') ?? request.headers['last-event-id'] ?? '';
  let replay = !desde;
  for (const evento of conversationService.history()) {
    if (replay) escrever(evento);
    else if (evento.id === desde) replay = true;
  }
  if (new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('stream') !== '1') { response.end(); return true; }
  const cancelar = conversationService.subscribe(escrever);
  const batimento = setInterval(() => response.write(': vivo\n\n'), BATIMENTO_MS);
  request.on('close', () => { cancelar(); clearInterval(batimento); });
  return true;
}
