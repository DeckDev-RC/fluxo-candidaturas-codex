import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { buildChatScript, buildInterruptScript, normalizeChatInput } = require('../skynet-chat.cjs');
const { createSkynetSession } = require('../skynet-session.cjs');

test('script do chat classifica, encaminha o token e acumula somente deltas de texto', async () => {
  const payload = normalizeChatInput({
    operationId: 'turno123',
    text: 'oi',
    prompt: 'Você é o Fluxo.\n\nPessoa: oi',
    conversationId: 'c12345678901234',
    messages: [{ id: 'm123456789012345', role: 'user', text: 'oi' }]
  });
  const requests = [];
  const chunks = [
    'data: {"type":"text-start"}\n\ndata: {"type":"text-delta","delta":"Olá"}\n',
    'data: {"type":"text-delta","delta":"!"}\n\ndata: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n'
  ].map((value) => new TextEncoder().encode(value));
  const context = {
    AbortController,
    TextDecoder,
    Uint8Array,
    fetch: async (path, options) => {
      requests.push([path, JSON.parse(options.body)]);
      if (path === '/api/classify-intent') return { ok: true, status: 200, json: async () => ({ decisionToken: 'decision-token' }) };
      let index = 0;
      return { ok: true, status: 200, body: { getReader: () => ({ async read() { return index < chunks.length ? { done: false, value: chunks[index++] } : { done: true }; } }) } };
    }
  };

  const result = await vm.runInNewContext(buildChatScript(payload), context);

  assert.equal(result.text, 'Olá!');
  assert.equal(result.finishReason, 'stop');
  assert.equal(requests[0][0], '/api/classify-intent');
  assert.equal(requests[1][0], '/api/chat-V4.5');
  assert.equal(requests[1][1].unifiedDecisionToken, 'decision-token');
  assert.equal(requests[1][1].messages[0].parts[0].text, payload.prompt);
  assert.equal(requests[1][1].chatMode, 'max');
});

test('stream incompleto é cancelado e nunca vira resposta parcial', async () => {
  const payload = normalizeChatInput({
    operationId: 'turno-incompleto',
    text: 'oi',
    prompt: 'Pessoa: oi',
    conversationId: 'c12345678901234',
    messages: [{ id: 'm123456789012345', role: 'user', text: 'oi' }]
  });
  let cancelled = false;
  const chunk = new TextEncoder().encode('data: {"type":"text-delta","delta":"parcial"}\n');
  let first = true;
  const context = {
    AbortController,
    TextDecoder,
    Uint8Array,
    fetch: async (path) => path === '/api/classify-intent'
      ? { ok: true, status: 200, json: async () => ({ decisionToken: 'decision-token' }) }
      : { ok: true, status: 200, body: { getReader: () => ({
        async read() { if (first) { first = false; return { done: false, value: chunk }; } return { done: true }; },
        async cancel() { cancelled = true; }
      }) } }
  };
  await assert.rejects(vm.runInNewContext(buildChatScript(payload), context), /SKYNET_STREAM_INCOMPLETE/);
  assert.equal(cancelled, true);
});

test('interrupção só alcança a operação correspondente', () => {
  let aborted = 0;
  const context = { __fluxoSkynetOperation: { id: 'turno-novo', controller: { abort() { aborted += 1; } } } };
  assert.equal(vm.runInNewContext(buildInterruptScript('turno-antigo'), context), false);
  assert.equal(aborted, 0);
  assert.equal(vm.runInNewContext(buildInterruptScript('turno-novo'), context), true);
  assert.equal(aborted, 1);
});

test('sessão mantém login e cookies dentro da BrowserWindow isolada', async () => {
  const statuses = [];
  const parent = { isDestroyed: () => false, show() {}, focus() {} };
  const session = createSkynetSession({
    BrowserWindow: FakeWindow,
    parentWindow: parent,
    onStatus: (status) => statuses.push(status)
  });

  assert.equal((await session.status()).authenticated, false);
  assert.equal(FakeWindow.last.options.webPreferences.devTools, false);
  const login = await session.startLogin();
  assert.equal(login.status, 'awaiting_user');
  assert.equal(FakeWindow.last.visible, true);
  assert.equal(FakeWindow.last.webContents.url, 'https://skynetchat.net/login');

  FakeWindow.last.webContents.authenticated = true;
  FakeWindow.last.webContents.url = 'https://skynetchat.net/';
  FakeWindow.last.webContents.emit('dom-ready');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await session.status()).authenticated, true);
  assert.equal(FakeWindow.last.visible, false);
  assert.ok(statuses.some((status) => status.authenticated));
  FakeWindow.last.visible = true;
  await session.status();
  assert.equal(FakeWindow.last.visible, false, 'qualquer sondagem autenticada oculta o popup');

  FakeWindow.last.webContents.chatResult = { text: 'Resposta segura.' };
  const result = await session.chat({
    operationId: 'turno123',
    text: 'oi',
    prompt: 'Pessoa: oi',
    conversationId: 'c12345678901234',
    messages: [{ id: 'm123456789012345', role: 'user', text: 'oi' }]
  });
  assert.equal(result.text, 'Resposta segura.');

  await session.logout();
  assert.equal(FakeWindow.last.webContents.storageCleared, true);
  session.destroy();
  assert.equal(FakeWindow.last.destroyed, true);
});

class FakeWindow {
  static last = null;

  constructor(options) {
    FakeWindow.last = this;
    this.options = options;
    this.listeners = {};
    this.visible = false;
    this.destroyed = false;
    const listeners = {};
    this.webContents = {
      url: '',
      authenticated: false,
      chatResult: null,
      session: {
        setPermissionRequestHandler() {},
        clearStorageData: async () => { this.webContents.storageCleared = true; }
      },
      setWindowOpenHandler() {},
      on: (event, listener) => { listeners[event] = listener; },
      emit: (event) => listeners[event]?.(),
      getURL: () => this.webContents.url,
      loadURL: async (url) => { this.webContents.url = url; },
      executeJavaScript: async (script) => {
        if (script.includes('sair da conta')) return this.webContents.authenticated;
        if (script.includes('const current = globalThis.__fluxoSkynetOperation')) return true;
        return this.webContents.chatResult;
      }
    };
  }

  isDestroyed() { return this.destroyed; }
  setMenuBarVisibility() {}
  on(event, listener) { this.listeners[event] = listener; }
  show() { this.visible = true; }
  hide() { this.visible = false; }
  focus() {}
  destroy() { this.destroyed = true; this.listeners.closed?.(); }
}
