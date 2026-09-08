import test from 'node:test';
import assert from 'node:assert/strict';
import { createHybridConversationService } from '../src/hybrid-conversation-service.mjs';
import { classificarRoteamento } from '../src/conversation-intent.mjs';

test('roteador envia texto ao Skynet e operações ao Codex', async () => {
  const provider = providerFake('skynet');
  const textual = conversationFake('texto');
  const operational = conversationFake('operacao');
  const hybrid = createHybridConversationService({
    textual,
    operational,
    providerService: provider,
    skynetAuthService: authenticated(),
    codexAuthService: authenticated()
  });
  const events = [];
  hybrid.subscribe((event) => events.push(event));

  await runAndFinish(hybrid, textual, 'oi');
  await runAndFinish(hybrid, operational, 'busque vagas de backend');
  await runAndFinish(hybrid, operational, 'sim');
  await hybrid.selectProvider('codex');
  await runAndFinish(hybrid, operational, 'explique meu objetivo');

  assert.deepEqual(textual.calls.map((call) => call.text), ['oi']);
  assert.deepEqual(operational.calls.map((call) => call.text), ['busque vagas de backend', 'sim', 'explique meu objetivo']);
  assert.ok(events.some((event) => event.type === 'assistant.message' && event.provider === 'skynet'));
  assert.ok(events.some((event) => event.type === 'assistant.message' && event.provider === 'codex'));
  assert.equal(new Set(events.map((event) => event.id)).size, events.length);
});

test('eventos de sistema usam Codex e operação sem login não cai silenciosamente no Skynet', async () => {
  const provider = providerFake('skynet');
  const textual = conversationFake('texto');
  const operational = conversationFake('operacao');
  const hybrid = createHybridConversationService({
    textual,
    operational,
    providerService: provider,
    skynetAuthService: authenticated(),
    codexAuthService: { status: async () => ({ authenticated: false }) }
  });

  await assert.rejects(hybrid.turn('abra o LinkedIn'), { code: 'codex_signed_out' });
  await assert.rejects(hybrid.turn('evento da interface', { system: true }), { code: 'codex_signed_out' });
  assert.equal(textual.calls.length, 0);
  assert.equal(operational.calls.length, 0);
});

test('troca de IA é recusada enquanto um turno está ativo', async () => {
  const provider = providerFake('skynet');
  const textual = conversationFake('texto');
  const hybrid = createHybridConversationService({
    textual,
    operational: conversationFake('operacao'),
    providerService: provider,
    skynetAuthService: authenticated(),
    codexAuthService: authenticated()
  });
  await hybrid.turn('oi');
  await assert.rejects(hybrid.selectProvider('codex'), { code: 'conversation_busy' });
  textual.finish(textual.calls[0].turnId);
  assert.equal((await hybrid.selectProvider('codex')).activeProvider, 'codex');
});

test('classificação preserva perguntas textuais e continua um turno operacional curto', () => {
  assert.equal(classificarRoteamento('qual é a minha meta?').route, 'textual');
  assert.equal(classificarRoteamento('abra o LinkedIn').route, 'operational');
  assert.equal(classificarRoteamento('candidate-se à melhor vaga').route, 'operational');
  assert.equal(classificarRoteamento('quero atualizar meu telefone').route, 'operational');
  assert.equal(classificarRoteamento('mude meu telefone e corrija a localização').route, 'operational');
  assert.equal(classificarRoteamento('quero remover esta informação').route, 'operational');
  assert.equal(classificarRoteamento('como atualizar meu objetivo').route, 'operational');
  assert.equal(classificarRoteamento('sim', { ultimoTurnoOperacional: true }).route, 'operational');
  assert.equal(classificarRoteamento('entrei', { aguardandoCodex: true }).route, 'operational');
  assert.equal(classificarRoteamento('oi', { ultimoTurnoOperacional: true }).route, 'textual');
});

async function runAndFinish(hybrid, target, text) {
  const completed = waitFor(hybrid, 'turn.completed');
  const result = await hybrid.turn(text);
  target.finish(result.turnId);
  await completed;
}

function conversationFake(label) {
  const listeners = new Set();
  let busy = false;
  let sequence = 0;
  const api = {
    calls: [],
    turn(text, options) {
      const turnId = `${label}-${++sequence}`;
      busy = true;
      api.calls.push({ text, options, turnId });
      emit({ id: `${turnId}-start`, type: 'turn.started', turnId, system: options.system });
      return { turnId, threadId: `${label}-thread`, runId: label === 'operacao' ? 'run-1' : '' };
    },
    finish(turnId) {
      emit({ id: `${turnId}-message`, type: 'assistant.message', turnId, text: label, actions: [] });
      busy = false;
      emit({ id: `${turnId}-done`, type: 'turn.completed', turnId, reply: label, actions: [] });
    },
    interrupt: async () => { busy = false; return { interrupted: true }; },
    reset: async () => { busy = false; emit({ id: `${label}-reset`, type: 'conversation.reset' }); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    history: () => [],
    status: () => ({ busy, turnId: '' }),
    handleNotification: () => false,
    handleToolCall: () => false
  };
  return api;
  function emit(event) { for (const listener of listeners) listener(event); }
}

function providerFake(initial) {
  let active = initial;
  return {
    get: () => active,
    set: async (provider) => { active = provider; return { activeProvider: active, availableProviders: ['skynet', 'codex'], source: 'user' }; },
    onChange: () => () => {}
  };
}

function authenticated() { return { status: async () => ({ authenticated: true }) }; }

function waitFor(service, type) {
  return new Promise((resolve) => {
    const stop = service.subscribe((event) => {
      if (event.type === type) { stop(); resolve(event); }
    });
  });
}
