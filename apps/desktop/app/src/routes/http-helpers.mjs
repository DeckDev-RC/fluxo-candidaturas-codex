// Utilitários de transporte compartilhados pelos grupos de rota. Nenhuma regra
// de domínio vive aqui: só formato de resposta, leitura de corpo e códigos HTTP.

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

const MAX_BODY_BYTES = 64 * 1024;

// Fluxo SSE seguro: escrita ignorada depois que a resposta terminou (no
// encerramento, `end()` acontece antes do socket fechar e um evento nesse
// intervalo lançaria ERR_STREAM_WRITE_AFTER_END), batimento e assinaturas
// cancelados tanto no fechamento do cliente quanto no fim da resposta.
export function abrirFluxo(request, response, { batimentoMs = 25_000 } = {}) {
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const limpezas = new Set();
  let encerrado = false;
  const escrever = (texto) => {
    if (encerrado || response.writableEnded || response.destroyed) return false;
    try { response.write(texto); return true; } catch { encerrar(); return false; }
  };
  const encerrar = () => {
    if (encerrado) return;
    encerrado = true;
    for (const limpeza of limpezas) { try { limpeza(); } catch { /* já limpo */ } }
    limpezas.clear();
  };
  const batimento = batimentoMs > 0 ? setInterval(() => escrever(': vivo\n\n'), batimentoMs) : null;
  if (batimento) limpezas.add(() => clearInterval(batimento));
  request.once('close', encerrar);
  response.once('finish', encerrar);
  response.once('close', encerrar);
  escrever(': conectado\n\n');
  return {
    evento(type, dados, id) { return escrever(`${id ? `id: ${id}\n` : ''}${type ? `event: ${type}\n` : ''}data: ${typeof dados === 'string' ? dados : JSON.stringify(dados)}\n\n`); },
    aoEncerrar(limpeza) { if (typeof limpeza === 'function') limpezas.add(limpeza); },
    encerrar
  };
}

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, JSON_HEADERS);
  const body = response.__mutationEnvelope && statusCode < 400 && payload && typeof payload === 'object' && !Array.isArray(payload)
    ? { ...payload, request_id: response.getHeader('x-request-id'), event_ids: payload.event_ids ?? [], state: payload.state ?? payload, data: payload }
    : payload;
  response.end(JSON.stringify(body));
}

export function sendDomainError(response, error) {
  const statusCode = statusFor(error?.code);
  sendJson(response, statusCode, {
    error: {
      code: error?.code ?? 'request_failed',
      message: error?.message ?? 'Não foi possível concluir a operação.',
      retryable: statusCode >= 500 || error?.code === 'fluxo_locked',
      actionRequired: statusCode === 401 ? 'authenticate' : statusCode === 403 ? 'confirm' : 'review',
      request_id: response.getHeader('x-request-id')
    }
  });
}

function statusFor(code = '') {
  if (['queue_item_not_found', 'run_not_found', 'approval_not_found'].includes(code)) return 404;
  if (code === 'fluxo_locked' || code === 'aggregate_blocked' || code.startsWith('queue_') || code.startsWith('approval_') || code === 'run_not_resumable') return 409;
  if (code === 'payload_too_large') return 413;
  return 400;
}

// Limite padrão pequeno (formulários); rotas que recebem arquivo pedem mais.
// Ao estourar, a leitura para de imediato e a mensagem diz o limite em MB.
export function readJsonBody(request, { maxBytes = MAX_BODY_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    let body = '';
    let excedido = false;
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      if (excedido) return;
      body += chunk;
      if (body.length > maxBytes) {
        excedido = true;
        const limite = maxBytes >= 1024 * 1024 ? `${Math.round(maxBytes / (1024 * 1024))} MB` : `${Math.round(maxBytes / 1024)} KB`;
        reject(Object.assign(new Error(`O conteúdo enviado é maior que o limite de ${limite}.`), { code: 'payload_too_large' }));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (excedido) return;
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(Object.assign(new Error('JSON inválido.'), { code: 'invalid_json' })); }
    });
    request.on('error', (error) => { if (!excedido) reject(error); });
  });
}

// Currículos chegam em base64: PDF de algumas páginas passa fácil de 64 KB.
export const MAX_RESUME_BODY_BYTES = 16 * 1024 * 1024;

export function queryOf(request) {
  return Object.fromEntries(new URL(request.url ?? '/', 'http://127.0.0.1').searchParams);
}

// Só chaves conhecidas do contexto de política chegam ao gateway.
export function sanitizePolicyContext(context = {}) {
  const sanitized = {};
  if (['captcha', 'mfa', 'biometric'].includes(context.browserChallenge)) sanitized.browserChallenge = context.browserChallenge;
  for (const key of ['sensitiveConfirmed', 'requireFinalConfirmation', 'allowAutomatedSubmission']) {
    if (typeof context[key] === 'boolean') sanitized[key] = context[key];
  }
  return sanitized;
}

export function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// Executa uma operação de rota e responde com JSON ou erro de domínio.
export async function respond(response, statusCode, operation) {
  try {
    sendJson(response, statusCode, await operation());
  } catch (error) {
    sendDomainError(response, error);
  }
  return true;
}
