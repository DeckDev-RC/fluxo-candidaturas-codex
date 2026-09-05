import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationService, separarAcoes } from '../src/conversation-service.mjs';
import { montarContexto } from '../src/conversation-prompt.mjs';
import { createServer } from '../src/http-server.mjs';

// Adaptador falso: abre thread, e a cada turno emite a resposta como o app-server faria.
function adaptadorFalso({ resposta = 'Olá! Comece pelo cartão de primeiro uso.' } = {}) {
  const chamadas = [];
  let notificar = () => {};
  const adapter = {
    request: async () => ({}),
    async startThread(params) { chamadas.push(['thread/start', params]); return { thread: { id: 'thread-conversa' } }; },
    async runTurn(threadId, text) {
      chamadas.push(['turn/start', { threadId, text }]);
      setTimeout(() => {
        notificar({ method: 'item/completed', params: { threadId, turnId: 'turn-1', item: { type: 'agentMessage', text: resposta } } });
        notificar({ method: 'turn/completed', params: { threadId, turn: { id: 'turn-1', status: 'completed' } } });
      }, 5);
      return { turn: { id: 'turn-1' } };
    },
    ligar(fn) { notificar = fn; }
  };
  return { adapter, chamadas };
}

test('um turno de conversa envia o contexto, sem ferramentas, e devolve o texto do assistente', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-conversa-'));
  const { adapter, chamadas } = adaptadorFalso({ resposta: 'Você está no primeiro uso: escreva o objetivo e importe o currículo.\nAÇÃO: abrir=primeiro-uso' });
  const service = createConversationService({ agentAdapter: adapter, rootDir, snapshot: async () => ({ situacao: 'primeiro uso', objetivo: '', plataformas: [] }) });
  adapter.ligar((mensagem) => service.handleNotification(mensagem));

  const resultado = await service.turn('oi, o que eu faço?');
  assert.equal(resultado.reply, 'Você está no primeiro uso: escreva o objetivo e importe o currículo.');
  assert.deepEqual(resultado.actions, [{ tipo: 'abrir', valor: 'primeiro-uso' }]);
  assert.equal(chamadas[0][0], 'thread/start');
  assert.equal(chamadas[0][1].conversation, true, 'a conversa não recebe ferramentas de operação');
  assert.match(chamadas[0][1].developerInstructions, /não envia nada sem aprovação/i);
  assert.match(chamadas[1][1].text, /CONTEXTO ATUAL/);
  assert.match(chamadas[1][1].text, /Situação: primeiro uso/);
  assert.match(chamadas[1][1].text, /Pessoa: oi, o que eu faço\?/);

  // A thread é persistida: a próxima mensagem não abre outra.
  await service.turn('e depois?');
  assert.equal(chamadas.filter(([metodo]) => metodo === 'thread/start').length, 1);
  assert.equal(JSON.parse(await readFile(join(rootDir, 'estado', 'conversa.json'), 'utf8')).threadId, 'thread-conversa');
});

test('notificações de outras threads são ignoradas e o turno expira com mensagem legível', async () => {
  const adapter = { request: async () => ({}), async startThread() { return { thread: { id: 'thread-x' } }; }, async runTurn() { return { turn: { id: 'turn-x' } }; } };
  const service = createConversationService({ agentAdapter: adapter, snapshot: async () => ({}), timeoutMs: 30 });
  assert.equal(service.handleNotification({ method: 'item/completed', params: { threadId: 'outra', item: { type: 'agentMessage', text: 'x' } } }), false);
  await assert.rejects(service.turn('oi'), { code: 'conversation_timeout' });
});

test('separarAcoes tira as linhas de ação do texto lido e o contexto lista o estado sem segredo', () => {
  const { resposta, acoes } = separarAcoes('Vou abrir suas **oportunidades**.\nAÇÃO: abrir=oportunidades');
  assert.equal(resposta, 'Vou abrir suas oportunidades.', 'markdown residual não chega à pessoa');
  assert.deepEqual(acoes, [{ tipo: 'abrir', valor: 'oportunidades' }]);
  const contexto = montarContexto({ situacao: 'escolher vaga', fila: 3, plataformas: [{ name: 'GUPY', goal: 5 }], fatosConfirmados: ['name'], lacunas: ['location'] });
  assert.match(contexto, /Vagas aguardando na fila: 3/);
  assert.match(contexto, /GUPY \(meta 5\)/);
  assert.doesNotMatch(contexto, /token|senha/i);
});

// Achado do teste com conta real: a IA dizia "jornada pausada" quando a execução
// só esperava a pessoa escolher uma vaga.
test('o retrato distingue espera pela pessoa de pausa deliberada', async () => {
  const { retratoParaConversa } = await import('../src/conversation-snapshot.mjs');
  const base = {
    rootDir: await mkdtemp(join(tmpdir(), 'fluxo-retrato-')),
    memoryService: { safeSummary: async () => ({ facts: { name: { confirmed: true, value: 'Pessoa Teste' }, targetRoles: { confirmed: true, value: 'Dev' } }, gaps: [] }) },
    approvalService: { listApprovals: () => [] },
    runtimeHealth: { snapshot: async () => ({ available: true }) }
  };
  const comEventos = (eventos) => ({ listRuns: () => [{ id: 'r1', kind: 'autopilot', status: 'paused', goal: 'x' }], listEvents: () => eventos });

  const esperando = await retratoParaConversa({ ...base, runService: comEventos([{ type: 'autopilot.waiting_user' }]) });
  assert.match(esperando.jornada, /aguardando você/);
  const pausada = await retratoParaConversa({ ...base, runService: comEventos([{ type: 'run.paused' }]) });
  assert.match(pausada.jornada, /pausada pela pessoa/);
  assert.equal(pausada.situacao.includes('primeiro uso'), true, 'sem plataformas no estado em disco, a situação continua sendo de configuração inicial');
});

test('a rota de conversa responde 503 sem IA e entrega a resposta com IA', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-conversa-http-'));
  const semIa = createServer({ rootDir, requireSession: false });
  await new Promise((resolve) => semIa.listen(0, '127.0.0.1', resolve));
  try {
    const resposta = await fetch(`http://127.0.0.1:${semIa.address().port}/api/v1/conversation/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'oi' }) });
    assert.equal(resposta.status, 503);
    assert.equal((await resposta.json()).error.code, 'agent_unavailable');
  } finally { await new Promise((resolve) => semIa.close(resolve)); }

  // Outra pasta: dois servidores sobre a mesma raiz não é cenário real.
  const outraRaiz = await mkdtemp(join(tmpdir(), 'fluxo-conversa-http-ia-'));
  const { adapter } = adaptadorFalso({ resposta: 'Estou aqui.' });
  const conversationService = createConversationService({ agentAdapter: adapter, rootDir: outraRaiz, snapshot: async () => ({}) });
  adapter.ligar((mensagem) => conversationService.handleNotification(mensagem));
  const comIa = createServer({ rootDir: outraRaiz, requireSession: false, conversationService });
  await new Promise((resolve) => comIa.listen(0, '127.0.0.1', resolve));
  try {
    const resposta = await fetch(`http://127.0.0.1:${comIa.address().port}/api/v1/conversation/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'oi' }) });
    assert.equal(resposta.status, 200);
    assert.equal((await resposta.json()).data.reply, 'Estou aqui.');
  } finally { await new Promise((resolve) => comIa.close(resolve)); }
});
