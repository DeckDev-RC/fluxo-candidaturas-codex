import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationService, separarAcoes } from '../src/conversation-service.mjs';
import { montarContexto } from '../src/conversation-prompt.mjs';
import { resumirFerramenta } from '../src/conversation-narration.mjs';
import { createServer } from '../src/http-server.mjs';

// Adaptador falso: abre thread e, a cada turno, emite o que o app-server emitiria.
// `roteiro(texto)` devolve a lista de eventos do turno (mensagens e chamadas de ferramenta).
function adaptadorFalso(roteiro = () => [{ mensagem: 'Olá! Comece pelo cartão de primeiro uso.' }], { concluir = true } = {}) {
  const chamadas = [];
  const vinculos = [];
  let notificar = () => {};
  let ferramenta = () => {};
  let contador = 0;
  const adapter = {
    request: async (method, params) => { chamadas.push([method, params]); return {}; },
    bindRun(runId, threadId) { vinculos.push([runId, threadId]); },
    async startThread(params) { chamadas.push(['thread/start', params]); return { thread: { id: 'thread-conversa' } }; },
    async runTurnForRun(runId, threadId, text) {
      chamadas.push(['turn/start', { runId, threadId, text }]);
      const turnId = `turn-${++contador}`;
      setTimeout(() => {
        for (const passo of roteiro(text)) {
          if (passo.mensagem) notificar({ method: 'item/completed', params: { threadId, turnId, item: { type: 'agentMessage', text: passo.mensagem } } });
          if (passo.ferramenta) { ferramenta({ phase: 'started', runId, threadId, turnId, tool: passo.ferramenta, arguments: passo.args ?? {} }); ferramenta({ phase: 'completed', runId, threadId, turnId, tool: passo.ferramenta, arguments: passo.args ?? {}, ok: true, result: passo.result ?? {} }); }
        }
        if (concluir) notificar({ method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed' } } });
      }, 5);
      return { turn: { id: turnId } };
    },
    ligar(service) { notificar = (m) => service.handleNotification(m); ferramenta = (c) => service.handleToolCall(c); }
  };
  return { adapter, chamadas, vinculos };
}

function runServiceFalso() {
  const runs = new Map();
  const eventos = [];
  return {
    startRun({ kind, mode, goal }) { const run = { id: `run-${runs.size + 1}`, kind, mode, goal, status: 'running' }; runs.set(run.id, run); return run; },
    getRun(id) { return runs.get(id) ?? null; },
    setAgentThread(id, threadId) { runs.get(id).agentThreadId = threadId; },
    appendEvent(evento) { eventos.push(evento); },
    eventos
  };
}

const ate = (service, tipo) => new Promise((resolve) => { const parar = service.subscribe((evento) => { if (evento.type === tipo) { parar(); resolve(evento); } }); });

test('um turno abre a thread com ferramentas, vincula um run e entrega a resposta por eventos', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-conversa-'));
  const { adapter, chamadas, vinculos } = adaptadorFalso(() => [{ mensagem: 'Você está no primeiro uso: escreva o objetivo e importe o currículo.\nAÇÃO: abrir=primeiro-uso' }]);
  const runService = runServiceFalso();
  const service = createConversationService({ agentAdapter: adapter, rootDir, runService, snapshot: async () => ({ situacao: 'primeiro uso', objetivo: '', plataformas: [] }) });
  adapter.ligar(service);

  const concluido = ate(service, 'turn.completed');
  const inicio = await service.turn('oi, o que eu faço?');
  assert.ok(inicio.turnId);
  const fim = await concluido;
  assert.equal(fim.reply, 'Você está no primeiro uso: escreva o objetivo e importe o currículo.');
  assert.deepEqual(fim.actions, [{ tipo: 'abrir', valor: 'primeiro-uso' }]);

  assert.equal(chamadas[0][0], 'thread/start');
  assert.equal(chamadas[0][1].conversation, undefined, 'a conversa condutora recebe as ferramentas fluxo_*');
  assert.match(chamadas[0][1].developerInstructions, /Nunca aprove um envio/);
  assert.deepEqual(vinculos, [['run-1', 'thread-conversa']]);
  assert.equal(runService.getRun('run-1').agentThreadId, 'thread-conversa');
  assert.match(chamadas[1][1].text, /CONTEXTO ATUAL/);
  assert.match(chamadas[1][1].text, /Pessoa: oi, o que eu faço\?/);
  assert.ok(runService.eventos.some((evento) => evento.type === 'conversation.user'), 'a fala da pessoa fica no histórico do run');

  // A thread é persistida: a próxima mensagem não abre outra nem outro run.
  const segundo = ate(service, 'turn.completed');
  await service.turn('e depois?');
  await segundo;
  assert.equal(chamadas.filter(([metodo]) => metodo === 'thread/start').length, 1);
  assert.equal(vinculos.length, 1);
  assert.equal(JSON.parse(await readFile(join(rootDir, 'estado', 'conversa.json'), 'utf8')).threadId, 'thread-conversa');
});

test('chamadas de ferramenta viram narração e esperas pela pessoa', async () => {
  const { adapter } = adaptadorFalso(() => [
    { ferramenta: 'fluxo_open_platform', args: { platform: 'LINKEDIN' }, result: { url: 'https://www.linkedin.com/login', loginPending: true, challenge: null } },
    { mensagem: 'Abri o LinkedIn na aba do navegador. Entre com a sua conta e me avise.' }
  ]);
  const service = createConversationService({ agentAdapter: adapter, runService: runServiceFalso(), snapshot: async () => ({}) });
  adapter.ligar(service);
  const eventos = [];
  service.subscribe((evento) => eventos.push(evento));
  const fim = ate(service, 'turn.completed');
  await service.turn('pode começar');
  await fim;
  const tipos = eventos.map((evento) => evento.type);
  assert.deepEqual(tipos, ['turn.started', 'tool.started', 'tool.completed', 'waiting_user', 'assistant.message', 'turn.completed']);
  assert.equal(eventos[1].summary, 'Abrindo LinkedIn na aba do navegador.');
  assert.equal(eventos[2].summary, 'LinkedIn está aberto e pede login.');
  assert.deepEqual(eventos[3].kind, 'login');
  assert.equal(eventos[3].platform, 'LINKEDIN');
});

test('turno de sistema é rotulado, mensagem em curso bloqueia outra e a interrupção encerra', async () => {
  const { adapter, chamadas } = adaptadorFalso(() => [], { concluir: false });
  const service = createConversationService({ agentAdapter: adapter, runService: runServiceFalso(), snapshot: async () => ({}), timeoutMs: 5000 });
  adapter.ligar(service);
  await service.turn('Aprovação demo-1 registrada. Prossiga.', { system: true });
  assert.match(chamadas.at(-1)[1].text, /SISTEMA \(evento da interface/);
  await assert.rejects(service.turn('outra'), { code: 'conversation_busy' });
  const falha = ate(service, 'turn.failed');
  const resultado = await service.interrupt();
  assert.equal(resultado.interrupted, true);
  assert.equal((await falha).code, 'conversation_interrupted');
  assert.ok(chamadas.some(([metodo]) => metodo === 'turn/interrupt'));
  assert.equal(service.status().busy, false);
});

// Achado do teste real: após reinstalar, a thread gravada não existia mais no
// app-server novo e a pessoa via "thread not found: 01a0…". A conversa deve
// retomar a thread quando possível e, senão, abrir outra sem mostrar erro.
test('thread gravada é retomada; se o app-server não a conhece, outra começa e o turno é repetido em silêncio', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-conversa-retomada-'));
  await mkdir(join(rootDir, 'estado'), { recursive: true });
  await writeFile(join(rootDir, 'estado', 'conversa.json'), JSON.stringify({ threadId: 'thread-antiga' }));

  // 1) O app-server conhece a thread: retoma e não cria outra.
  const { adapter, chamadas } = adaptadorFalso(() => [{ mensagem: 'Continuando de onde paramos.' }]);
  adapter.resumeThread = async (threadId, params) => { chamadas.push(['thread/resume', { threadId, ...params }]); return { thread: { id: threadId } }; };
  const service = createConversationService({ agentAdapter: adapter, rootDir, runService: runServiceFalso(), snapshot: async () => ({}) });
  adapter.ligar(service);
  const fim = ate(service, 'turn.completed');
  await service.turn('oi de novo');
  assert.equal((await fim).reply, 'Continuando de onde paramos.');
  assert.deepEqual(chamadas.filter(([m]) => m === 'thread/resume').map(([, p]) => p.threadId), ['thread-antiga']);
  assert.equal(chamadas.some(([m]) => m === 'thread/start'), false);
  assert.match(chamadas.find(([m]) => m === 'thread/resume')[1].developerInstructions, /Nunca aprove um envio/);

  // 2) O app-server não conhece a thread nem na retomada nem no turno: nova thread, turno repetido, sem erro.
  const outraRaiz = await mkdtemp(join(tmpdir(), 'fluxo-conversa-perdida-'));
  await mkdir(join(outraRaiz, 'estado'), { recursive: true });
  await writeFile(join(outraRaiz, 'estado', 'conversa.json'), JSON.stringify({ threadId: 'thread-sumida' }));
  const perdida = adaptadorFalso(() => [{ mensagem: 'Nova conversa, mesma pessoa.' }]);
  perdida.adapter.resumeThread = async () => { throw new Error('thread not found: thread-sumida'); };
  const original = perdida.adapter.runTurnForRun.bind(perdida.adapter);
  let falhas = 0;
  perdida.adapter.runTurnForRun = async (runId, threadId, texto) => {
    if (threadId === 'thread-sumida') { falhas += 1; throw new Error('thread not found: thread-sumida'); }
    return original(runId, threadId, texto);
  };
  const servico2 = createConversationService({ agentAdapter: perdida.adapter, rootDir: outraRaiz, runService: runServiceFalso(), snapshot: async () => ({}) });
  perdida.adapter.ligar(servico2);
  const eventos = [];
  servico2.subscribe((evento) => eventos.push(evento.type));
  const fim2 = ate(servico2, 'turn.completed');
  await servico2.turn('ola abra o meu linkedin');
  assert.equal((await fim2).reply, 'Nova conversa, mesma pessoa.');
  assert.equal(falhas, 0, 'a retomada falhou antes do turno, então a thread nova já foi usada');
  assert.equal(eventos.includes('turn.failed'), false, 'nenhum erro chega à tela');
  assert.equal(JSON.parse(await readFile(join(outraRaiz, 'estado', 'conversa.json'), 'utf8')).threadId, 'thread-conversa');

  // 3) A thread some entre a retomada e o turno: o turno é repetido numa thread nova.
  const tardia = adaptadorFalso(() => [{ mensagem: 'Repeti seu pedido.' }]);
  let retomadas = 0;
  tardia.adapter.resumeThread = async (threadId) => { retomadas += 1; return { thread: { id: threadId } }; };
  const originalTardia = tardia.adapter.runTurnForRun.bind(tardia.adapter);
  let tentativasNaAntiga = 0;
  tardia.adapter.runTurnForRun = async (runId, threadId, texto) => {
    if (threadId === 'thread-antiga') { tentativasNaAntiga += 1; throw new Error('thread not found: thread-antiga'); }
    return originalTardia(runId, threadId, texto);
  };
  const servico3 = createConversationService({ agentAdapter: tardia.adapter, rootDir, runService: runServiceFalso(), snapshot: async () => ({}) });
  tardia.adapter.ligar(servico3);
  const fim3 = ate(servico3, 'turn.completed');
  await servico3.turn('continue');
  assert.equal((await fim3).reply, 'Repeti seu pedido.');
  assert.equal(tentativasNaAntiga, 1);
  assert.equal(retomadas, 1);
});

test('notificações de outras threads são ignoradas e o turno expira com mensagem legível', async () => {
  const { adapter } = adaptadorFalso(() => [], { concluir: false });
  const service = createConversationService({ agentAdapter: adapter, snapshot: async () => ({}), timeoutMs: 30 });
  adapter.ligar(service);
  assert.equal(service.handleNotification({ method: 'item/completed', params: { threadId: 'outra', item: { type: 'agentMessage', text: 'x' } } }), false);
  const falha = ate(service, 'turn.failed');
  await service.turn('oi');
  assert.equal((await falha).code, 'conversation_timeout');
});

test('separarAcoes, contexto e narração não vazam segredo nem vocabulário técnico', () => {
  const { resposta, acoes } = separarAcoes('Vou abrir suas **oportunidades**.\nAÇÃO: abrir=oportunidades');
  assert.equal(resposta, 'Vou abrir suas oportunidades.');
  assert.deepEqual(acoes, [{ tipo: 'abrir', valor: 'oportunidades' }]);
  const contexto = montarContexto({ situacao: 'escolher vaga', fila: 3, plataformas: [{ name: 'GUPY', goal: 5 }], fatosConfirmados: ['name'], lacunas: ['location'], abas: [{ platform: 'GUPY', loginPending: true }] });
  assert.match(contexto, /Vagas aguardando na fila: 3/);
  assert.match(contexto, /GUPY \(login pendente\)/);
  assert.doesNotMatch(contexto, /token|senha/i);
  const revisao = resumirFerramenta({ tool: 'fluxo_review', arguments: { runId: 'r' }, ok: true, result: { id: 'ap-1' } });
  assert.equal(revisao.espera.kind, 'approval');
  assert.equal(revisao.espera.approvalId, 'ap-1');
  const falha = resumirFerramenta({ tool: 'fluxo_discover', arguments: { platform: 'GUPY' }, ok: false, error: { message: 'página não suportada' } });
  assert.match(falha.fim, /Não deu certo: página não suportada/);
});

// Achado do teste com conta real: a IA dizia "jornada pausada" quando a execução
// só esperava a pessoa escolher uma vaga.
test('o retrato distingue espera pela pessoa de pausa deliberada', async () => {
  const { retratoParaConversa } = await import('../src/conversation-snapshot.mjs');
  const base = {
    rootDir: await mkdtemp(join(tmpdir(), 'fluxo-retrato-')),
    memoryService: { safeSummary: async () => ({ facts: { name: { confirmed: true, value: 'Pessoa Teste' }, targetRoles: { confirmed: true, value: 'Dev' } }, gaps: [] }) },
    approvalService: { listApprovals: () => [] },
    runtimeHealth: { snapshot: async () => ({ available: true }) },
    browserAdapter: { tabs: async () => [{ platform: 'GUPY', loginPending: false, challenge: null }] }
  };
  const comEventos = (eventos) => ({ listRuns: () => [{ id: 'r1', kind: 'autopilot', status: 'paused', goal: 'x' }], listEvents: () => eventos });
  const esperando = await retratoParaConversa({ ...base, runService: comEventos([{ type: 'autopilot.waiting_user' }]) });
  assert.match(esperando.jornada, /aguardando você/);
  assert.equal(esperando.abas[0].platform, 'GUPY');
  const pausada = await retratoParaConversa({ ...base, runService: comEventos([{ type: 'run.paused' }]) });
  assert.match(pausada.jornada, /pausada pela pessoa/);
});

test('a rota de conversa responde 503 sem IA, aceita o turno com 202 e transmite eventos', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-conversa-http-'));
  const semIa = createServer({ rootDir, requireSession: false });
  await new Promise((resolve) => semIa.listen(0, '127.0.0.1', resolve));
  try {
    const resposta = await fetch(`http://127.0.0.1:${semIa.address().port}/api/v1/conversation/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'oi' }) });
    assert.equal(resposta.status, 503);
  } finally { await new Promise((resolve) => semIa.close(resolve)); }

  const outraRaiz = await mkdtemp(join(tmpdir(), 'fluxo-conversa-http-ia-'));
  const { adapter } = adaptadorFalso(() => [{ mensagem: 'Estou aqui.' }]);
  const conversationService = createConversationService({ agentAdapter: adapter, rootDir: outraRaiz, snapshot: async () => ({}) });
  adapter.ligar(conversationService);
  const comIa = createServer({ rootDir: outraRaiz, requireSession: false, conversationService });
  await new Promise((resolve) => comIa.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${comIa.address().port}`;
    const controle = new AbortController();
    const fluxo = await fetch(`${base}/api/v1/conversation/events?stream=1`, { signal: controle.signal });
    assert.match(fluxo.headers.get('content-type'), /^text\/event-stream/);
    const leitor = fluxo.body.getReader();
    const resposta = await fetch(`${base}/api/v1/conversation/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'oi' }) });
    assert.equal(resposta.status, 202);
    assert.ok((await resposta.json()).data.turnId);
    let recebido = '';
    while (!/event: turn\.completed/.test(recebido)) recebido += new TextDecoder().decode((await leitor.read()).value);
    assert.match(recebido, /event: assistant\.message/);
    assert.match(recebido, /"reply":"Estou aqui\."/);
    controle.abort();
  } finally { await new Promise((resolve) => comIa.close(resolve)); }
});
