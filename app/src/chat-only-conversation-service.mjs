import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { montarContexto } from './conversation-prompt.mjs';
import { separarAcoes } from './conversation-service.mjs';
import { buildSkynetPrompt } from './skynet-conversation-prompt.mjs';

const FILE = 'estado/conversa-skynet.json';
const MAX_EVENTS = 200;
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 30_000;

export function createChatOnlyConversationService({
  client,
  snapshot = async () => ({}),
  rootDir = '',
  now = () => new Date(),
  timeoutMs = 3 * 60 * 1000
} = {}) {
  if (typeof client?.chat !== 'function') throw new TypeError('A conversa textual requer um cliente.');
  const listeners = new Set();
  const events = [];
  let messages = [];
  let conversationId = createConversationId();
  let active = null;
  let loaded = false;
  let sequence = 0;

  const service = {
    turn(text, { system = false } = {}) {
      const request = String(text ?? '').trim();
      if (!request) throw domainError('conversation_empty', 'Escreva algo para o Fluxo responder.');
      if (active) throw domainError('conversation_busy', 'O Fluxo ainda está respondendo. Aguarde ou interrompa.');
      const turn = { id: `turno-${id()}`, system, request };
      active = turn;
      turn.timer = setTimeout(() => {
        void client.interrupt?.(turn.id);
        fail(turn, domainError('conversation_timeout', 'O SkynetChat demorou demais para responder.'));
      }, timeoutMs);
      emit('turn.started', { turnId: turn.id, system });
      void execute(turn);
      return { turnId: turn.id, threadId: conversationId, runId: '' };
    },

    async interrupt() {
      const turn = active;
      if (!turn) return { interrupted: false };
      const interruption = Promise.resolve(client.interrupt?.(turn.id)).catch(() => {});
      fail(turn, domainError('conversation_interrupted', 'Interrompido por você.'));
      await interruption;
      return { interrupted: true };
    },

    async reset() {
      if (active) await this.interrupt();
      await ensureLoaded();
      messages = [];
      conversationId = createConversationId();
      await persist();
      emit('conversation.reset', {});
      return { reset: true };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    history() { return [...events]; },

    status() {
      return { threadId: conversationId, runId: '', busy: Boolean(active), turnId: active?.id ?? '', provider: 'skynet-chat-only' };
    }
  };

  return service;

  async function execute(turn) {
    try {
      await ensureLoaded();
      if (active !== turn) return;
      const userMessage = { id: createMessageId(), role: 'user', text: turn.request };
      const nextMessages = [...messages, userMessage].slice(-MAX_MESSAGES);
      const currentSnapshot = await snapshot();
      if (active !== turn) return;
      const context = montarContexto(currentSnapshot, now());
      const prompt = buildSkynetPrompt({ text: turn.request, context, system: turn.system });
      if (active !== turn) return;
      const result = await client.chat({
        operationId: turn.id,
        text: turn.request,
        prompt,
        conversationId,
        messages: nextMessages
      });
      if (active !== turn) return;
      const assistantText = String(result?.text ?? '').trim();
      if (!assistantText) throw domainError('skynet_empty_response', 'O SkynetChat não devolveu uma resposta.');
      if (assistantText.length > MAX_MESSAGE_CHARS) throw domainError('skynet_response_too_large', 'A resposta do SkynetChat excedeu o limite seguro.');
      messages = [...nextMessages, { id: createMessageId(), role: 'assistant', text: assistantText }].slice(-MAX_MESSAGES);
      await persist();
      if (active !== turn) return;
      // Saída do provedor textual nunca dirige a interface: marcas AÇÃO são
      // removidas, mas não executadas, mesmo se o modelo ignorar a instrução.
      const { resposta } = separarAcoes(assistantText);
      const actions = [];
      emit('assistant.message', { turnId: turn.id, text: resposta, actions });
      complete(turn, resposta, actions);
    } catch (error) {
      fail(turn, readableError(error));
    }
  }

  function complete(turn, reply, actions) {
    if (active !== turn) return;
    clearTimeout(turn.timer);
    active = null;
    emit('turn.completed', { turnId: turn.id, status: 'completed', reply, actions });
  }

  function fail(turn, error) {
    if (active !== turn) return;
    clearTimeout(turn.timer);
    active = null;
    emit('turn.failed', { turnId: turn.id, code: error?.code ?? 'turn_failed', message: error?.message ?? String(error) });
  }

  function emit(type, payload) {
    const event = { id: `${Date.now()}-${sequence++}`, type, at: now().toISOString(), ...payload };
    events.push(event);
    while (events.length > MAX_EVENTS) events.shift();
    for (const listener of listeners) {
      try { listener(event); } catch { /* observador não interrompe a conversa */ }
    }
  }

  async function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    if (!rootDir) return;
    try {
      const saved = JSON.parse(await readFile(join(rootDir, FILE), 'utf8'));
      if (/^[A-Za-z0-9_-]{1,80}$/.test(saved.conversationId ?? '')) conversationId = saved.conversationId;
      if (Array.isArray(saved.messages)) messages = saved.messages.filter(validMessage).slice(-MAX_MESSAGES);
    } catch { /* primeira conversa ou estado antigo inválido */ }
  }

  async function persist() {
    if (!rootDir) return;
    await mkdir(join(rootDir, 'estado'), { recursive: true });
    await writeFile(join(rootDir, FILE), JSON.stringify({ conversationId, messages }, null, 2), 'utf8');
  }
}

function validMessage(value) {
  return value && /^[A-Za-z0-9_-]{1,80}$/.test(value.id ?? '')
    && ['user', 'assistant'].includes(value.role)
    && typeof value.text === 'string'
    && value.text.length <= MAX_MESSAGE_CHARS;
}

function readableError(error) {
  const value = String(error?.message ?? error);
  if (error?.code === 'skynet_signed_out' || /SKYNET_SIGNED_OUT|SKYNET_HTTP_401/i.test(value)) {
    return domainError('skynet_signed_out', 'A sessão do SkynetChat expirou. Entre novamente em Configurações.');
  }
  if (/SKYNET_HTTP_403/i.test(value)) {
    return domainError('skynet_forbidden', 'O modelo escolhido não está disponível para esta conta do SkynetChat.');
  }
  if (/SKYNET_RESPONSE_TOO_LARGE/i.test(value)) {
    return domainError('skynet_response_too_large', 'A resposta do SkynetChat excedeu o limite seguro.');
  }
  if (/SKYNET_STREAM_(INCOMPLETE|ERROR|MISSING)/i.test(value)) {
    return domainError('skynet_stream_failed', 'A resposta do SkynetChat foi interrompida antes de terminar.');
  }
  if (error?.code && !['skynet_failed', 'skynet_bridge_failed'].includes(error.code)) return error;
  return domainError('skynet_chat_failed', 'Não foi possível obter uma resposta do SkynetChat.');
}

function createConversationId() { return `c${id().slice(0, 14)}`; }
function createMessageId() { return id().slice(0, 16); }
function id() { return randomUUID().replaceAll('-', ''); }
function domainError(code, message) { return Object.assign(new Error(message), { code }); }
