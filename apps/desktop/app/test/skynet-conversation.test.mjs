import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChatOnlyConversationService } from '../src/chat-only-conversation-service.mjs';
import { createSkynetAuthService } from '../src/skynet-auth-service.mjs';
import { createRuntimeHealth } from '../src/runtime-health.mjs';
import { createConversationProviderService } from '../src/conversation-provider-service.mjs';
import { resolveAiMode } from '../src/ai-modes.mjs';
import { createServer } from '../src/http-server.mjs';

test('auth do SkynetChat reflete a janela sem expor credenciais', async () => {
  await assert.rejects(createSkynetAuthService().startLogin(), { code: 'skynet_unavailable' });
  let status = { status: 'signed_out', authenticated: false };
  const calls = [];
  const host = {
    status: async () => status,
    startLogin: async () => { calls.push('login'); return { status: 'awaiting_user', authenticated: false }; },
    logout: async () => { calls.push('logout'); }
  };
  const service = createSkynetAuthService({ host });
  const changes = [];
  service.onChange((value) => changes.push(value));

  assert.equal((await service.status()).authenticated, false);
  assert.equal((await service.startLogin()).status, 'awaiting_user');
  status = { status: 'authenticated', authenticated: true };
  service.handleStatus(status);
  assert.equal((await service.status()).authenticated, true);
  await service.logout();

  assert.deepEqual(calls, ['login', 'logout']);
  assert.equal(JSON.stringify(changes).includes('token'), false);
  assert.equal(JSON.stringify(changes).includes('cookie'), false);
});

test('conversa textual emite resposta sem fingir ferramentas e persiste o histórico', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-skynet-chat-'));
  const calls = [];
  const client = {
    chat: async (input) => { calls.push(input); return { text: 'Posso orientar em texto, sem operar plataformas.\nAÇÃO: tema=escuro' }; },
    interrupt: async () => ({ interrupted: true })
  };
  const service = createChatOnlyConversationService({
    client,
    rootDir,
    snapshot: async () => ({ situacao: 'pronta para buscar', objetivo: 'Backend', fatosConfirmados: ['targetRoles'] })
  });
  const events = [];
  service.subscribe((event) => events.push(event));
  const completed = waitFor(service, 'turn.completed');

  const started = service.turn('abra o LinkedIn');
  assert.ok(started.turnId);
  const result = await completed;

  assert.equal(result.reply, 'Posso orientar em texto, sem operar plataformas.');
  assert.deepEqual(result.actions, []);
  assert.deepEqual(events.map((event) => event.type), ['turn.started', 'assistant.message', 'turn.completed']);
  assert.equal(events.some((event) => event.type.startsWith('tool.')), false);
  assert.match(calls[0].prompt, /não possui ferramentas/i);
  assert.match(calls[0].prompt, /Objetivo: Backend/);
  const saved = JSON.parse(await readFile(join(rootDir, 'estado', 'conversa-skynet.json'), 'utf8'));
  assert.deepEqual(saved.messages.map((message) => message.role), ['user', 'assistant']);
});

test('interrupção da conversa textual encerra o turno ativo imediatamente', async () => {
  let release;
  const interruptedIds = [];
  const client = {
    chat: () => new Promise((resolve) => { release = resolve; }),
    interrupt: async (operationId) => { interruptedIds.push(operationId); return { interrupted: true }; }
  };
  const service = createChatOnlyConversationService({ client, timeoutMs: 5_000 });
  const failed = waitFor(service, 'turn.failed');
  const turn = service.turn('demore');
  const result = await service.interrupt();
  assert.equal(result.interrupted, true);
  assert.equal((await failed).code, 'conversation_interrupted');
  assert.deepEqual(interruptedIds, [turn.turnId]);
  release?.({ text: 'tarde demais' });
});

test('interrupção durante o retrato não inicia uma chamada fantasma', async () => {
  let releaseSnapshot;
  let chatCalls = 0;
  const service = createChatOnlyConversationService({
    client: { chat: async () => { chatCalls += 1; return { text: 'não deveria chamar' }; }, interrupt: async () => ({ interrupted: true }) },
    snapshot: () => new Promise((resolve) => { releaseSnapshot = resolve; })
  });
  service.turn('pare antes da rede');
  await new Promise((resolve) => setImmediate(resolve));
  await service.interrupt();
  releaseSnapshot({});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(chatCalls, 0);
});

test('rotas e saúde anunciam SkynetChat somente texto', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-skynet-api-'));
  const auth = {
    status: async () => ({ status: 'authenticated', authenticated: true, message: 'conectado' }),
    startLogin: async () => ({ status: 'awaiting_user', authenticated: false }),
    logout: async () => ({ status: 'signed_out', authenticated: false }),
    onChange: () => () => {}
  };
  const providerService = createConversationProviderService({ fallback: 'skynet' });
  await providerService.load();
  const health = createRuntimeHealth({ skynetAuthService: auth, providerService, conversationProvider: 'skynet' });
  const snapshot = await health.snapshot();
  assert.equal(snapshot.mode, 'skynet-hybrid');
  assert.equal(snapshot.capabilities.tools, false);
  assert.equal(resolveAiMode({ requested: snapshot.mode, runtime: snapshot }).provider, 'skynet-chat');

  let resets = 0;
  const conversationService = {
    reset: async () => { resets += 1; },
    status: () => ({ busy: false, provider: 'skynet-chat-only' }),
    history: () => [],
    subscribe: () => () => {}
  };
  const server = createServer({ rootDir, requireSession: false, skynetAuthService: auth, providerService, runtimeHealth: health, conversationService });
  await listen(server);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/api/v1/auth/skynet`)).status, 200);
    assert.equal((await fetch(`${base}/api/v1/auth/skynet/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 400);
    assert.equal((await fetch(`${base}/api/v1/auth/skynet/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ privacyConsent: true, consentVersion: 'v1' }) })).status, 202);
    assert.equal((await fetch(`${base}/api/v1/auth/skynet/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 200);
    assert.equal(resets, 1);
    assert.equal((await (await fetch(`${base}/api/v1/ai/mode`)).json()).mode, 'skynet-hybrid');
    assert.equal((await (await fetch(`${base}/api/v1/ai/provider`)).json()).activeProvider, 'skynet');
    const switched = await fetch(`${base}/api/v1/ai/provider`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'codex' }) });
    assert.equal(switched.status, 200);
    assert.equal((await switched.json()).data.activeProvider, 'codex');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

function waitFor(service, type) {
  return new Promise((resolve) => {
    const stop = service.subscribe((event) => {
      if (event.type === type) { stop(); resolve(event); }
    });
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}
