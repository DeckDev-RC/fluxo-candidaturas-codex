import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { assinaturaDasFerramentas, createConversationService, separarAcoes } from '../src/conversation-service.mjs';
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
    listEvents(runId) { return eventos.filter((evento) => evento.runId === runId); },
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
  assert.doesNotMatch(chamadas[1][1].text, /Sessão: app reaberto/, 'thread criada agora não é retomada');
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

test('login pendente é observado na aba; resolvido, a IA recebe um turno de sistema para seguir', async () => {
  const { adapter, chamadas } = adaptadorFalso((texto) => (/SISTEMA/.test(texto)
    ? [{ mensagem: 'Vi que você entrou. Buscando vagas.' }]
    : [
      { ferramenta: 'fluxo_open_platform', args: { platform: 'LINKEDIN' }, result: { url: 'https://www.linkedin.com/login', loginPending: true, challenge: null } },
      { mensagem: 'Abri o LinkedIn. Entre com a sua conta.' }
    ]));
  let estado = { open: true, loginPending: true, challenge: null, url: 'https://www.linkedin.com/login' };
  const consultas = [];
  const service = createConversationService({ agentAdapter: adapter, runService: runServiceFalso(), snapshot: async () => ({}), loginState: async (p) => { consultas.push(p); return estado; }, watchIntervalMs: 10 });
  adapter.ligar(service);
  const eventos = [];
  service.subscribe((evento) => eventos.push(evento));
  const fim = ate(service, 'turn.completed');
  await service.turn('abra o linkedin');
  await fim;
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(consultas.length >= 1, 'a aba é consultada enquanto o login está pendente');
  assert.ok(!eventos.some((e) => e.type === 'waiting_resolved'), 'com login ainda pendente nada muda');
  const resolvido = ate(service, 'waiting_resolved');
  const proximo = ate(service, 'turn.completed');
  estado = { open: true, loginPending: false, challenge: null, url: 'https://www.linkedin.com/feed/' };
  const aviso = await resolvido;
  assert.equal(aviso.platform, 'LINKEDIN');
  assert.equal(aviso.kind, 'login');
  await proximo;
  const turnoDeSistema = chamadas.filter(([m]) => m === 'turn/start').at(-1)[1].text;
  assert.match(turnoDeSistema, /SISTEMA/);
  assert.match(turnoDeSistema, /a pessoa entrou em LINKEDIN/);
  const antes = consultas.length;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(consultas.length, antes, 'a observação para depois de resolver');
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
  // Achado do teste real: um "oi" após reabrir fazia a IA retomar o InfoJobs sozinha.
  // O primeiro turno após a retomada avisa que o app foi reaberto; os seguintes, não.
  const turnos = chamadas.filter(([m]) => m === 'turn/start');
  assert.match(turnos[0][1].text, /Sessão: app reaberto agora/);
  const segundoFim = ate(service, 'turn.completed');
  await service.turn('pode continuar');
  await segundoFim;
  assert.doesNotMatch(chamadas.filter(([m]) => m === 'turn/start')[1][1].text, /Sessão: app reaberto/);

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

// Achados da auditoria de robustez: dois pedidos no mesmo instante passavam pela
// checagem de "ocupado"; eventos de um turno interrompido fechavam o turno novo;
// o Codex morto só era percebido pelo prazo de 15 minutos.
test('dois turnos no mesmo instante: só um começa; o segundo recebe conversation_busy', async () => {
  const { adapter, chamadas } = adaptadorFalso(() => [{ mensagem: 'ok' }]);
  const service = createConversationService({ agentAdapter: adapter, runService: runServiceFalso(), snapshot: async () => ({}) });
  adapter.ligar(service);
  const fim = ate(service, 'turn.completed');
  const resultados = await Promise.allSettled([service.turn('primeiro'), service.turn('segundo')]);
  assert.equal(resultados[0].status, 'fulfilled');
  assert.equal(resultados[1].status, 'rejected');
  assert.equal(resultados[1].reason.code, 'conversation_busy');
  await fim;
  assert.equal(chamadas.filter(([m]) => m === 'turn/start').length, 1);
});

test('eventos de um turno interrompido não fecham nem alimentam o turno seguinte', async () => {
  const { adapter } = adaptadorFalso(() => [], { concluir: false });
  const service = createConversationService({ agentAdapter: adapter, runService: runServiceFalso(), snapshot: async () => ({}), timeoutMs: 5000 });
  adapter.ligar(service);
  await service.turn('primeiro');
  const antigo = service.status();
  await service.interrupt();
  await service.turn('segundo');
  const eventos = [];
  service.subscribe((evento) => eventos.push(evento));
  // O app-server ainda emite o fim do turno antigo (turn-1) e um texto dele.
  service.handleNotification({ method: 'item/completed', params: { threadId: 'thread-conversa', turnId: 'turn-1', item: { type: 'agentMessage', text: 'resto do antigo' } } });
  service.handleNotification({ method: 'turn/completed', params: { threadId: 'thread-conversa', turn: { id: 'turn-1', status: 'interrupted' } } });
  assert.equal(service.status().busy, true, 'o turno novo continua em curso');
  assert.deepEqual(eventos.map((e) => e.type), [], 'nada do turno antigo chega à tela');
  assert.notEqual(service.status().turnId, antigo.turnId);
  await service.interrupt();
});

test('o Codex morrer no meio do turno encerra o turno na hora, e o próximo pedido reabre', async () => {
  const { adapter, chamadas } = adaptadorFalso(() => [], { concluir: false });
  const service = createConversationService({ agentAdapter: adapter, runService: runServiceFalso(), snapshot: async () => ({}), timeoutMs: 60_000 });
  adapter.ligar(service);
  await service.turn('vai demorar');
  const falha = ate(service, 'turn.failed');
  assert.equal(service.handleNotification({ method: 'transport/closed', params: { code: 'agent_closed', message: 'Agente encerrou com código 1.' } }), false, 'o aviso segue para os demais ouvintes (saúde)');
  const evento = await falha;
  assert.equal(evento.code, 'agent_closed');
  assert.match(evento.message, /conexão com o ChatGPT caiu/);
  assert.equal(service.status().busy, false);
  // Processo novo do app-server: a thread gravada é retomada antes do turno seguinte.
  adapter.resumeThread = async (threadId) => { chamadas.push(['thread/resume', { threadId }]); return { thread: { id: threadId } }; };
  await service.turn('de novo');
  assert.ok(chamadas.some(([m]) => m === 'thread/resume'), 'a thread é retomada no processo novo');
  await service.interrupt();
});

test('ferramentas novas desde que a thread nasceu: não retoma (o app-server manteria o conjunto antigo), começa outra e grava a assinatura', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-conversa-ferramentas-'));
  await mkdir(join(rootDir, 'estado'), { recursive: true });
  // Achado real: a thread criada antes de fluxo_discard existir era retomada a cada
  // abertura e a IA respondia "não consigo limpar a fila pelas ferramentas disponíveis".
  await writeFile(join(rootDir, 'estado', 'conversa.json'), JSON.stringify({ threadId: 'thread-antiga', toolsSignature: 'assinatura-velha' }));
  const antiga = assinaturaDasFerramentas([{ name: 'fluxo_state', description: 'x', inputSchema: {} }]);
  const nova = assinaturaDasFerramentas([{ name: 'fluxo_state', description: 'x', inputSchema: {} }, { name: 'fluxo_discard', description: 'y', inputSchema: {} }]);
  assert.notEqual(antiga, nova);
  assert.equal(antiga, assinaturaDasFerramentas([{ name: 'fluxo_state', description: 'x', inputSchema: {} }]), 'a assinatura é estável para o mesmo conjunto');

  const { adapter, chamadas } = adaptadorFalso(() => [{ mensagem: 'Posso descartar as vagas antigas.' }]);
  adapter.resumeThread = async (threadId) => { chamadas.push(['thread/resume', { threadId }]); return { thread: { id: threadId } }; };
  // A sessão anterior deixou a conversa gravada nos eventos do seu run: vira memória.
  const runService = runServiceFalso();
  const anterior = runService.startRun({ kind: 'autopilot', mode: 'conversa', goal: 'x' });
  runService.appendEvent({ runId: anterior.id, type: 'conversation.user', payload: { text: 'quero vagas de COBOL remotas' } });
  runService.appendEvent({ runId: anterior.id, type: 'conversation.tool', payload: { tool: 'fluxo_discover', summary: 'Buscando…' } });
  // Como o run-service real devolve: carga em JSON texto.
  runService.appendEvent({ runId: anterior.id, type: 'conversation.assistant', payloadJson: JSON.stringify({ text: 'Encontrei 8 vagas de COBOL. ' + 'x'.repeat(400) }) });
  await writeFile(join(rootDir, 'estado', 'conversa.json'), JSON.stringify({ threadId: 'thread-antiga', toolsSignature: 'assinatura-velha', runId: anterior.id }));
  const service = createConversationService({ agentAdapter: adapter, rootDir, runService, snapshot: async () => ({}), toolsSignature: nova });
  adapter.ligar(service);
  const fim = ate(service, 'turn.completed');
  await service.turn('quero limpar a fila');
  await fim;
  assert.equal(chamadas.some(([m]) => m === 'thread/resume'), false, 'a thread com ferramentas velhas não é retomada');
  assert.equal(chamadas.filter(([m]) => m === 'thread/start').length, 1);
  const primeiroTexto = chamadas.find(([m]) => m === 'turn/start')[1].text;
  assert.match(primeiroTexto, /Sessão: app reaberto/, 'a conversa nova ainda avisa que nada continua em curso');
  assert.match(primeiroTexto, /Conversa anterior \(memória resumida/);
  assert.match(primeiroTexto, /Pessoa: quero vagas de COBOL remotas/);
  assert.match(primeiroTexto, /Fluxo: Encontrei 8 vagas de COBOL\. x+…/, 'fala longa é encurtada');
  assert.doesNotMatch(primeiroTexto, /fluxo_discover|Buscando…/, 'chamadas de ferramenta não entram na memória');
  const gravado = JSON.parse(await readFile(join(rootDir, 'estado', 'conversa.json'), 'utf8'));
  assert.equal(gravado.threadId, 'thread-conversa');
  assert.equal(gravado.toolsSignature, nova);
  assert.equal(gravado.runId, 'run-2', 'o run desta sessão fica gravado para a próxima');
  // O segundo turno não repete a memória.
  const fimSegundo = ate(service, 'turn.completed');
  await service.turn('e agora?');
  await fimSegundo;
  assert.doesNotMatch(chamadas.filter(([m]) => m === 'turn/start')[1][1].text, /Conversa anterior/);

  // Mesma assinatura na próxima abertura: retoma normalmente.
  const segunda = adaptadorFalso(() => [{ mensagem: 'ok' }]);
  segunda.adapter.resumeThread = async (threadId) => { segunda.chamadas.push(['thread/resume', { threadId }]); return { thread: { id: threadId } }; };
  const outro = createConversationService({ agentAdapter: segunda.adapter, rootDir, runService: runServiceFalso(), snapshot: async () => ({}), toolsSignature: nova });
  segunda.adapter.ligar(outro);
  const fim2 = ate(outro, 'turn.completed');
  await outro.turn('oi');
  await fim2;
  assert.deepEqual(segunda.chamadas.filter(([m]) => m === 'thread/resume').map(([, p]) => p.threadId), ['thread-conversa']);
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
  // Cartões da conversa: seleção para descarte, confirmação de dados e respostas rápidas.
  assert.deepEqual(separarAcoes('Marque as que quer descartar.\nAÇÃO: selecionar-descarte=todas').acoes, [{ tipo: 'selecionar-descarte', valor: 'todas' }]);
  assert.deepEqual(separarAcoes('Li isto:\nAÇÃO: confirmar=name:Pessoa Exemplo|email:pessoa@example.test').acoes, [{ tipo: 'confirmar', valor: 'name:Pessoa Exemplo|email:pessoa@example.test' }]);
  assert.deepEqual(separarAcoes('Oi! Por onde seguimos?\nAÇÃO: opcoes=Buscar COBOL|Ver a fila').acoes, [{ tipo: 'opcoes', valor: 'Buscar COBOL|Ver a fila' }]);
  const contexto = montarContexto({ situacao: 'escolher vaga', fila: 3, plataformas: [{ name: 'GUPY', goal: 5 }], fatosConfirmados: ['name'], lacunas: ['location'], abas: [{ platform: 'GUPY', loginPending: true }] });
  assert.match(contexto, /Vagas aguardando na fila: 3/);
  assert.match(contexto, /GUPY \(login pendente\)/);
  assert.doesNotMatch(contexto, /token|senha/i);
  const revisao = resumirFerramenta({ tool: 'fluxo_review', arguments: { runId: 'r' }, ok: true, result: { id: 'ap-1' } });
  assert.equal(revisao.espera.kind, 'approval');
  assert.equal(revisao.espera.approvalId, 'ap-1');
  const falha = resumirFerramenta({ tool: 'fluxo_discover', arguments: { platform: 'GUPY' }, ok: false, error: { message: 'página não suportada' } });
  assert.match(falha.fim, /Não deu certo: página não suportada/);
  // Código conhecido vira o que a pessoa pode fazer; mensagem técnica não vaza.
  assert.match(resumirFerramenta({ tool: 'fluxo_discover', arguments: { platform: 'GUPY' }, ok: false, error: { code: 'platform_disabled', message: 'platform_disabled' } }).fim, /Gupy não está habilitada.*Ajustar plataformas/);
  const tecnica = resumirFerramenta({ tool: 'fluxo_prepare', arguments: {}, ok: false, error: { code: 'weird', message: "Cannot read properties of undefined (reading 'url')" } }).fim;
  assert.doesNotMatch(tecnica, /undefined|Cannot read/);
  assert.match(tecnica, /Não deu certo nesta etapa/);
  assert.doesNotMatch(resumirFerramenta({ tool: 'fluxo_prepare', arguments: {}, ok: false, error: { message: 'ENOENT: no such file C:\\x\\y.json' } }).fim, /ENOENT|json/);
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
