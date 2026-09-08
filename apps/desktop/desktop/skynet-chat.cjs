const MAX_MESSAGE_CHARS = 30_000;

function normalizeChatInput(input = {}) {
  const operationId = identifier(input.operationId, 'operação');
  const text = bounded(input.text, 20_000, 'Mensagem');
  const prompt = bounded(input.prompt, 60_000, 'Contexto da conversa');
  const conversationId = identifier(input.conversationId, 'conversa');
  const messages = (Array.isArray(input.messages) ? input.messages : []).slice(-24).map((message) => ({
    id: identifier(message.id, 'mensagem'),
    role: ['user', 'assistant'].includes(message.role) ? message.role : 'user',
    text: bounded(message.text, MAX_MESSAGE_CHARS, 'Mensagem do histórico')
  }));
  if (!messages.length || messages.at(-1).role !== 'user') throw failure('skynet_invalid_turn', 'O turno atual do SkynetChat está inválido.');
  return { operationId, text, prompt, conversationId, messages, maxResponseChars: MAX_MESSAGE_CHARS };
}

function buildChatScript(payload) {
  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `(${runSkynetChat.toString()})(${serialized}, ${readTextStream.toString()})`;
}

function buildInterruptScript(operationId = '') {
  const expected = String(operationId ?? '');
  if (expected && !/^[A-Za-z0-9_-]{1,80}$/.test(expected)) throw failure('skynet_invalid_input', 'Identificador de operação inválido.');
  return `(() => {
    const current = globalThis.__fluxoSkynetOperation;
    const expected = ${JSON.stringify(expected)};
    if (!current || (expected && current.id !== expected)) return false;
    current.controller.abort();
    return true;
  })()`;
}

async function runSkynetChat(payload, readStream) {
  globalThis.__fluxoSkynetOperation?.controller?.abort();
  const controller = new AbortController();
  const operation = { id: payload.operationId, controller };
  globalThis.__fluxoSkynetOperation = operation;
  const post = async (path, body) => {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(response.status === 401 ? 'SKYNET_SIGNED_OUT' : `SKYNET_HTTP_${response.status}`);
    return response;
  };
  try {
    const previousAssistantText = [...payload.messages].reverse().find((message) => message.role === 'assistant')?.text ?? '';
    const recentContext = payload.messages.slice(-6).map((message) => `${message.role}: ${message.text}`).join('\n');
    const classified = await post('/api/classify-intent', {
      text: payload.text,
      previousAssistantText,
      recentContext,
      awaitingImageDescription: false,
      hasGeneratedImage: false
    }).then((response) => response.json());
    if (!classified?.decisionToken) throw new Error('SKYNET_CLASSIFICATION_FAILED');

    const current = payload.messages.at(-1);
    const messages = payload.messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts: [{ type: 'text', text: message === current ? payload.prompt : message.text }]
    }));
    const response = await post('/api/chat-V4.5', {
      id: current.id,
      conversationId: payload.conversationId,
      messages,
      trigger: 'submit-message',
      chatMode: 'max',
      hasGeneratedImage: false,
      unifiedDecisionToken: classified.decisionToken
    });
    if (!response.body) throw new Error('SKYNET_STREAM_MISSING');
    return readStream(response.body, payload.maxResponseChars, controller);
  } finally {
    if (globalThis.__fluxoSkynetOperation === operation) delete globalThis.__fluxoSkynetOperation;
  }
}

async function readTextStream(body, maxChars, controller) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finishReason = '';
  let terminal = false;
  const consume = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const data = trimmed.slice(5).trim();
    if (!data) return;
    if (data === '[DONE]') { terminal = true; return; }
    let frame;
    try { frame = JSON.parse(data); } catch { return; }
    if (frame.type === 'text-delta' && typeof frame.delta === 'string') text += frame.delta;
    if (frame.type === 'text-end' || frame.type === 'finish') terminal = true;
    if (frame.type === 'finish') finishReason = String(frame.finishReason ?? frame.reason ?? '');
    if (frame.type === 'error') throw new Error('SKYNET_STREAM_ERROR');
    if (text.length > maxChars) throw new Error('SKYNET_RESPONSE_TOO_LARGE');
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) consume(line);
      if (done) break;
    }
    if (buffer) consume(buffer);
    if (!terminal) throw new Error('SKYNET_STREAM_INCOMPLETE');
    return { text, finishReason };
  } catch (error) {
    await reader.cancel().catch(() => {});
    controller.abort();
    throw error;
  }
}

function bounded(value, max, label) {
  const text = String(value ?? '').trim();
  if (!text || text.length > max) throw failure('skynet_invalid_input', `${label} ausente ou longa demais.`);
  return text;
}

function identifier(value, label) {
  const text = String(value ?? '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(text)) throw failure('skynet_invalid_input', `Identificador de ${label} inválido.`);
  return text;
}

function failure(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = { buildChatScript, buildInterruptScript, normalizeChatInput };
