// Conversa com o Fluxo = o agente condutor. Cada mensagem da pessoa vira um
// turno real no Codex app-server, em uma thread com as ferramentas fluxo_*,
// dona de um run desta sessão. O agente lê, pergunta, abre o navegador, busca,
// compara e preenche; os portões (aprovação, dado sensível, CAPTCHA/MFA) ficam
// no código, fora da vontade do modelo. Tudo o que acontece vira evento para a
// tela: texto do assistente, cada ferramenta chamada, esperas pela pessoa.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { INSTRUCOES_DA_CONVERSA, montarContexto } from './conversation-prompt.mjs';
import { classificarPedido, esforcoParaNavegador, turnoFoiDeNavegador } from './conversation-intent.mjs';
import { resumirFerramenta } from './conversation-narration.mjs';

const ARQUIVO = 'estado/conversa.json';
const PRAZO_TURNO_MS = 15 * 60 * 1000;
const HISTORICO_EVENTOS = 200;
// Linhas finais "AÇÃO: ..." que a interface sabe executar com confirmação da pessoa.
const ACOES = /^AÇÃO:\s*(abrir|objetivo|modalidades|selecionar-descarte|confirmar|opcoes|tema|limpar-conversa)\s*=\s*(.+)$/imu;

// Enquanto a IA espera a pessoa entrar numa plataforma (ou resolver cookies /
// verificação), o serviço observa a aba; quando resolve, avisa a IA sozinho.
const OBSERVACAO_INTERVALO_MS = 3_000;
const OBSERVACAO_PRAZO_MS = 10 * 60 * 1000;

// O app-server guarda as ferramentas dinâmicas no metadado da thread quando ela
// nasce e `thread/resume` não aceita uma lista nova: uma thread retomada fica
// com o conjunto antigo, sem as ferramentas criadas depois. A assinatura do
// conjunto atual fica gravada com a thread; se mudou, uma thread nova começa.
// As instruções entram na assinatura: uma thread longa imita o próprio estilo
// anterior (dezenas de respostas em texto corrido pesam mais que a instrução
// nova), então mudar as instruções também recomeça a thread, com a memória
// resumida da anterior.
export function assinaturaDasFerramentas(definitions = [], instrucoes = INSTRUCOES_DA_CONVERSA) {
  const base = (Array.isArray(definitions) ? definitions : []).map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema ?? tool.parameters ?? null }));
  return createHash('sha1').update(JSON.stringify(base)).update(String(instrucoes ?? '')).digest('hex').slice(0, 16);
}

export function createConversationService({ agentAdapter, snapshot = async () => ({}), rootDir = '', runService = null, tabs = null, loginState = null, codexSettings = null, toolsSignature = '', canAutoContinue = () => true, now = () => new Date(), timeoutMs = PRAZO_TURNO_MS, watchIntervalMs = OBSERVACAO_INTERVALO_MS } = {}) {
  if (!agentAdapter?.request) throw new TypeError('A conversa requer o adaptador do agente.');
  let threadId = '';
  // Thread que este processo do app-server já conhece (retomada ou criada aqui).
  let retomada = '';
  let runId = '';
  let carregado = false;
  let primeiroTurnoDaSessao = true;
  // A thread desta sessão veio de uma gravação (app reaberto), não foi criada agora.
  let retomadaDeGravacao = false;
  let turnoAtivo = null;
  let observacao = null; // intervalo que observa a aba enquanto a IA espera login
  let ferramentasRenovadas = false; // thread anterior descartada por ferramentas novas
  let ultimoTurnoNavegou = false; // o turno anterior usou o navegador (continuação curta é navegação)
  // Quando a thread anterior não pode ser retomada (ferramentas mudaram, app-server
  // a perdeu), a memória da conversa vem do histórico local gravado nos eventos do
  // run anterior e entra no contexto do primeiro turno da thread nova.
  let conversaAnterior = [];
  let gravado = {};
  const ouvintes = new Set();
  const historico = [];

  const service = {
    // Notificações do app-server pertencentes à conversa: texto e fim do turno.
    handleNotification(message) {
      const params = message?.params ?? {};
      // O processo do Codex morreu: o turno em curso termina agora, não pelo prazo.
      if (message?.method === 'transport/closed') {
        if (turnoAtivo) falharTurno(domainError(params.code ?? 'agent_closed', 'A conexão com o ChatGPT caiu no meio da resposta. Tente de novo.'));
        retomada = '';
        return false;
      }
      const alvo = String(params.threadId ?? params.thread?.id ?? '');
      if (!threadId || alvo !== threadId) return false;
      const turno = turnoAtivo;
      if (!turno || turno.reservado) return true;
      // Eventos de um turno antigo (interrompido) não podem fechar nem alimentar o atual.
      const turnoDoEvento = String(params.turnId ?? params.turn?.id ?? '');
      if (turnoDoEvento && turno.codexTurnId && turnoDoEvento !== turno.codexTurnId) return true;
      // Deltas de texto não vão para a tela nem para o histórico: a mensagem completa basta.
      if (message.method === 'item/completed' && params.item?.type === 'agentMessage') {
        const texto = String(params.item.text ?? '');
        turno.textos.push(texto);
        const { resposta, acoes } = separarAcoes(texto);
        emitir('assistant.message', { turnId: turno.id, text: resposta, actions: acoes });
      }
      if (message.method === 'turn/completed') concluirTurno(String(params.turn?.status ?? 'completed'));
      if (message.method === 'error' || params.error) falharTurno(new Error(String(params.error?.message ?? params.message ?? 'O turno falhou.')));
      return true;
    },

    // Chamadas de ferramenta do run desta conversa, narradas para a tela.
    handleToolCall(chamada) {
      if (!runId || chamada.runId !== runId) return false;
      const resumo = resumirFerramenta(chamada);
      if (chamada.phase === 'started') emitir('tool.started', { tool: chamada.tool, summary: resumo.inicio });
      else {
        emitir('tool.completed', { tool: chamada.tool, ok: chamada.ok, summary: resumo.fim, error: chamada.ok ? null : chamada.error });
        if (resumo.espera) { emitir('waiting_user', resumo.espera); observarEspera(resumo.espera); }
        if (chamada.ok && ['fluxo_open_platform', 'fluxo_browser_status'].includes(chamada.tool)) publicarAbas(chamada.result);
      }
      // Um "sim" ou "manda" logo depois de um turno só de navegador continua esse trabalho;
      // se o turno também tocou a campanha (busca, fila), a continuação é campanha.
      if (turnoAtivo) { turnoAtivo.ferramentas ??= new Set(); turnoAtivo.ferramentas.add(String(chamada.tool)); ultimoTurnoNavegou = turnoFoiDeNavegador(turnoAtivo.ferramentas); }
      registrar('conversation.tool', { tool: chamada.tool, phase: chamada.phase, ok: chamada.ok ?? null, summary: chamada.phase === 'started' ? resumo.inicio : resumo.fim });
      return true;
    },

    // Turno assíncrono: devolve o identificador e segue emitindo eventos.
    async turn(texto, { system = false } = {}) {
      const pedido = String(texto ?? '').trim();
      if (!pedido) throw domainError('conversation_empty', 'Escreva algo para o Fluxo responder.');
      if (turnoAtivo) throw domainError('conversation_busy', 'O Fluxo ainda está trabalhando na mensagem anterior. Aguarde ou interrompa.');
      // A reserva é síncrona, antes de qualquer espera: dois pedidos no mesmo
      // instante não podem passar os dois pela checagem acima.
      const turno = abrirTurno();
      turno.reservado = true;
      turnoAtivo = turno;
      // Uma fala da pessoa encerra a observação: se ela disse "já entrei", a IA confere sozinha.
      if (!system) pararObservacao();
      try {
        await this.ensureThread();
        await ensureRun();
        // O primeiro turno de cada processo avisa que o app foi reaberto: a thread
        // retomada lembra o que estava fazendo, mas nada disso continua em curso.
        // Pedido de navegação: contexto enxuto (só a aba) e raciocínio mais alto.
        // Evento da interface nunca é navegação; ele carrega o contexto inteiro.
        const intencao = system ? { navegador: false } : classificarPedido(pedido, { ultimoTurnoNavegou });
        const contexto = montarContexto(await snapshot(), now(), { sessaoNova: primeiroTurnoDaSessao && (retomadaDeGravacao || ferramentasRenovadas), conversaAnterior: primeiroTurnoDaSessao ? conversaAnterior : [], modo: intencao.navegador ? 'navegador' : 'completo' });
        primeiroTurnoDaSessao = false;
        const entrada = `${contexto}\n\n${system ? 'SISTEMA (evento da interface, não é fala da pessoa)' : 'Pessoa'}: ${pedido}`;
        turno.reservado = false;
        registrar(system ? 'conversation.system' : 'conversation.user', { text: pedido, ...(intencao.navegador ? { modo: 'navegador' } : {}) });
        emitir('turn.started', { turnId: turno.id, system });
        ultimoTurnoNavegou = false;
        turno.codexTurnId = await iniciarTurnoNoAgente(entrada, intencao.navegador ? await ajustesDeNavegador() : {});
      } catch (error) {
        if (turnoAtivo === turno) { turno.reservado = false; falharTurno(error); }
        throw error;
      }
      return { turnId: turno.id, threadId, runId };
    },

    async interrupt() {
      const turno = turnoAtivo;
      if (!turno) return { interrupted: false };
      if (turno.codexTurnId) await agentAdapter.request('turn/interrupt', { threadId, turnId: turno.codexTurnId }).catch(() => {});
      falharTurno(domainError('conversation_interrupted', 'Interrompido por você.'));
      return { interrupted: true };
    },

    // A thread gravada é retomada no app-server (a memória da conversa sobrevive
    // ao reinício do app); se ele não a conhecer mais, uma nova começa.
    async ensureThread() {
      if (!carregado) {
        gravado = await carregar(rootDir);
        threadId = gravado.threadId ?? '';
        carregado = true;
        // Ferramentas mudaram desde que a thread nasceu: retomá-la deixaria a IA
        // sem as novas (ela diria "não consigo" para algo que existe). Começa outra.
        if (threadId && toolsSignature && gravado.toolsSignature !== toolsSignature) { threadId = ''; ferramentasRenovadas = true; }
      }
      if (threadId && retomada === threadId) return threadId;
      const parametros = { metadata: { mode: 'fluxo-condutor' }, developerInstructions: INSTRUCOES_DA_CONVERSA };
      if (threadId && agentAdapter.resumeThread) {
        try { await agentAdapter.resumeThread(threadId, parametros); retomada = threadId; retomadaDeGravacao = true; return threadId; }
        catch (error) { if (!threadPerdida(error)) throw error; threadId = ''; }
      }
      // Thread nova no lugar de uma gravada: a memória vem do histórico local.
      if (gravado.threadId && primeiroTurnoDaSessao) conversaAnterior = resumirConversaAnterior(runService, gravado.runId);
      const iniciado = await agentAdapter.startThread(parametros);
      threadId = String(iniciado?.thread?.id ?? iniciado?.threadId ?? '');
      if (!threadId) throw domainError('conversation_thread_failed', 'O Codex não abriu uma conversa.');
      retomada = threadId;
      gravado = { threadId, toolsSignature, startedAt: now().toISOString() };
      await persistir(rootDir, gravado);
      return threadId;
    },

    async reset({ silencioso = false } = {}) {
      pararObservacao();
      if (turnoAtivo) await this.interrupt();
      threadId = '';
      retomada = '';
      runId = '';
      carregado = true;
      await persistir(rootDir, { threadId: '' });
      if (!silencioso) emitir('conversation.reset', {});
    },

    subscribe(listener) { ouvintes.add(listener); return () => ouvintes.delete(listener); },
    history() { return [...historico]; },
    status() { return { threadId, runId, busy: Boolean(turnoAtivo), turnId: turnoAtivo?.id ?? '' }; }
  };
  return service;

  // Começa o turno; se a thread sumiu no app-server (reinício, expiração),
  // abre outra em silêncio e repete uma vez. A pessoa não vê o erro técnico.
  // Esforço de raciocínio do turno de navegador: sobe até "high" quando a configuração
  // da pessoa está abaixo e o modelo aceita. Sem serviço de configuração, nada muda.
  async function ajustesDeNavegador() {
    if (!codexSettings?.get) return {};
    try {
      const [configuracao, catalogo] = await Promise.all([codexSettings.get(), codexSettings.listModels ? codexSettings.listModels() : []]);
      const effort = esforcoParaNavegador(configuracao, catalogo);
      return effort ? { effort } : {};
    } catch { return {}; }
  }

  async function iniciarTurnoNoAgente(entrada, ajustes = {}) {
    try {
      const resultado = await agentAdapter.runTurnForRun(runId, threadId, entrada, ajustes);
      return String(resultado?.turn?.id ?? '');
    } catch (error) {
      if (!threadPerdida(error)) throw error;
      threadId = ''; retomada = '';
      await persistir(rootDir, { threadId: '' });
      await service.ensureThread();
      agentAdapter.bindRun?.(runId, threadId);
      runService?.setAgentThread?.(runId, threadId);
      try {
        const resultado = await agentAdapter.runTurnForRun(runId, threadId, entrada, ajustes);
        return String(resultado?.turn?.id ?? '');
      } catch (novoErro) {
        throw domainError('conversation_thread_lost', `A conversa anterior não está mais disponível e não consegui abrir outra: ${novoErro?.message ?? novoErro}`);
      }
    }
  }

  // Um run por sessão do processo é dono das chamadas de ferramenta; um run
  // que deixou de estar em execução (reinício, reconciliação) é substituído.
  async function ensureRun() {
    if (runId && runService?.getRun?.(runId)?.status === 'running') return runId;
    if (!runService?.startRun) { runId = runId || 'conversa'; return runId; }
    const run = runService.startRun({ kind: 'autopilot', mode: 'conversa', goal: 'Conversa conduzida pela IA' });
    runId = run.id;
    if (runService.setAgentThread) runService.setAgentThread(runId, threadId);
    agentAdapter.bindRun?.(runId, threadId);
    // O run desta sessão fica gravado com a thread: é dele que a próxima sessão
    // recupera a conversa se a thread não puder ser retomada.
    gravado = { ...gravado, runId };
    await persistir(rootDir, gravado);
    return runId;
  }

  // Espera por login/verificação/cookies numa plataforma: observa a aba a cada
  // poucos segundos; resolvida, emite `waiting_resolved` e, se a IA estiver livre,
  // manda um turno de sistema para ela continuar. A pessoa não precisa clicar "Já entrei".
  function observarEspera(espera) {
    if (!loginState || !['login', 'challenge', 'consent'].includes(espera?.kind) || !espera.platform) return;
    pararObservacao();
    const inicio = Date.now();
    const plataforma = String(espera.platform).toUpperCase();
    observacao = setInterval(async () => {
      if (Date.now() - inicio > OBSERVACAO_PRAZO_MS) { pararObservacao(); return; }
      let estado;
      try { estado = await loginState(plataforma); } catch { return; }
      if (!estado?.open || estado.loginPending || estado.challenge || estado.consentPending) return;
      if (!canAutoContinue()) return;
      pararObservacao();
      emitir('waiting_resolved', { kind: espera.kind, platform: plataforma, url: estado.url ?? '' });
      if (turnoAtivo) return;
      const nome = { login: 'entrou', challenge: 'resolveu a verificação', consent: 'decidiu o aviso de cookies' }[espera.kind] ?? 'resolveu a pendência';
      service.turn(`Detectei que a pessoa ${nome} em ${plataforma}: a aba não pede mais login nem verificação. Continue de onde parou sem pedir confirmação.`, { system: true }).catch(() => {});
    }, watchIntervalMs);
  }
  function pararObservacao() { if (observacao) { clearInterval(observacao); observacao = null; } }

  // As abas do navegador vão para a tela sem HTML nem formulário: só plataforma, URL, título e estado.
  function publicarAbas(resultado) {
    const fonte = Array.isArray(resultado?.tabs) ? Promise.resolve(resultado.tabs) : Promise.resolve(tabs?.()).catch(() => null);
    fonte.then((lista) => {
      if (!Array.isArray(lista)) return;
      emitir('browser.tabs', { tabs: lista.map((aba) => ({ platform: aba.platform, url: aba.url ?? '', title: aba.title ?? '', loginPending: aba.loginPending === true, challenge: aba.challenge ?? null })) });
    });
  }

  function abrirTurno() {
    const turno = { id: `turno-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, codexTurnId: '', textos: [] };
    turno.prazo = setTimeout(() => falharTurno(domainError('conversation_timeout', 'O Fluxo demorou demais para responder. Tente de novo ou interrompa.')), timeoutMs);
    return turno;
  }

  function concluirTurno(status) {
    const turno = turnoAtivo;
    if (!turno) return;
    clearTimeout(turno.prazo);
    turnoAtivo = null;
    const bruto = turno.textos.join('\n').trim();
    const { resposta, acoes } = separarAcoes(bruto);
    registrar('conversation.assistant', { text: resposta, actions: acoes, status });
    emitir('turn.completed', { turnId: turno.id, status, reply: resposta, actions: acoes });
  }

  function falharTurno(error) {
    const turno = turnoAtivo;
    if (!turno) return;
    clearTimeout(turno.prazo);
    turnoAtivo = null;
    registrar('conversation.failed', { code: error?.code ?? 'turn_failed', message: error?.message ?? String(error) });
    emitir('turn.failed', { turnId: turno.id, code: error?.code ?? 'turn_failed', message: error?.message ?? String(error) });
  }

  function emitir(type, payload) {
    const evento = { id: `${Date.now()}-${historico.length}`, type, at: now().toISOString(), ...payload };
    historico.push(evento);
    while (historico.length > HISTORICO_EVENTOS) historico.shift();
    for (const ouvinte of ouvintes) { try { ouvinte(evento); } catch {} }
  }

  function registrar(type, payload) {
    if (!runId || !runService?.appendEvent) return;
    try { runService.appendEvent({ runId, type, payload, actorType: type === 'conversation.user' ? 'user' : 'agent' }); } catch {}
  }
}

// Separa a resposta do que a interface deve fazer. Cada AÇÃO fica fora do texto
// lido, e marcas de markdown que escaparem das instruções são removidas.
export function separarAcoes(texto) {
  const acoes = [];
  const linhas = String(texto ?? '').split('\n').filter((linha) => {
    const m = linha.match(ACOES);
    if (!m) return true;
    acoes.push({ tipo: m[1].toLowerCase(), valor: m[2].trim() });
    return false;
  });
  return { resposta: estruturarEntidades(normalizarMarcacao(linhas.join('\n'))), acoes };
}

// Rede de segurança quando o modelo ignora o formato: parágrafos que começam com
// um nome próprio sintético e dois-pontos ("Pessoa Exemplo: Full Stack…") viram
// cartões, e "Conclusão:"/"Recomendação:" viram seção. Só age quando há pelo
// menos dois desses parágrafos e nenhuma marcação; caso contrário devolve igual.
const ENTIDADE = /^((?:[A-ZÀ-Ú][\wÀ-ú.'’-]*)(?:\s(?:[A-ZÀ-Úa-zà-ú][\wÀ-ú.'’-]*)){1,4}):\s+(.{30,})$/s;
const SECAO = /^(Conclusão|Recomendação|Recomendações|Resumo|Próximo passo|Próximos passos|Pendências|Observação):\s+(.+)$/s;
export function estruturarEntidades(texto) {
  if (/(^|\n)\s*(#{2,3}\s|[-*]\s|\d+[.)]\s|>\s)/.test(texto)) return texto;
  const paragrafos = texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const entidades = paragrafos.filter((p) => ENTIDADE.test(p) && !SECAO.test(p));
  if (entidades.length < 2) return texto;
  return paragrafos.map((p) => {
    const secao = p.match(SECAO);
    if (secao) return `## ${secao[1]}\n${secao[2]}`;
    const entidade = p.match(ENTIDADE);
    if (entidade) return `### ${entidade[1]}\n${entidade[2]}`;
    return p;
  }).join('\n\n');
}

// A interface desenha um subconjunto de marcação (## seção, - item, 1. item,
// **destaque**, > nota). O que o modelo escrever fora disso é trazido para dentro
// dele: títulos de outros níveis viram seção, __x__ vira **x**, "* item" vira
// "- item", linhas de tabela viram itens, crases somem.
function normalizarMarcacao(texto) {
  return texto
    .replace(/__(.+?)__/g, '**$1**')
    .replace(/^#{1,6}\s+(.+?)\s*#*\s*$/gm, '## $1')
    .replace(/^\s*\*\s+/gm, '- ')
    .replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '')
    .replace(/^\s*\|(.+)\|\s*$/gm, (linha, celulas) => `- ${celulas.split('|').map((c) => c.trim()).filter(Boolean).join(' · ')}`)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Últimas falas da conversa anterior, a partir dos eventos gravados do run. Só
// texto de pessoa e de Fluxo (sem ferramentas), cortado curto: é memória, não
// transcrição, e nunca contém segredo porque o histórico já é o que foi mostrado.
const FALAS_ANTERIORES = 12;
const TAMANHO_FALA = 240;
export function resumirConversaAnterior(runService, runId) {
  if (!runId || !runService?.listEvents) return [];
  let eventos = [];
  try { eventos = runService.listEvents(runId) ?? []; } catch { return []; }
  return eventos
    .filter((evento) => ['conversation.user', 'conversation.assistant'].includes(evento.type))
    .map((evento) => ({ tipo: evento.type, texto: String(cargaDoEvento(evento).text ?? '').trim() }))
    .filter((fala) => fala.texto)
    .slice(-FALAS_ANTERIORES)
    .map((fala) => `${fala.tipo === 'conversation.user' ? 'Pessoa' : 'Fluxo'}: ${encurtar(fala.texto)}`);
}

// O run-service em SQLite devolve `payloadJson` (texto); os falsos de teste, `payload`.
function cargaDoEvento(evento) {
  if (evento.payload && typeof evento.payload === 'object') return evento.payload;
  try { return JSON.parse(evento.payloadJson ?? '{}') ?? {}; } catch { return {}; }
}

function encurtar(texto) {
  const limpo = String(texto).replace(/\s+/g, ' ').trim();
  return limpo.length > TAMANHO_FALA ? `${limpo.slice(0, TAMANHO_FALA - 1)}…` : limpo;
}

async function carregar(rootDir) {
  try { return JSON.parse(await readFile(join(rootDir, ARQUIVO), 'utf8')); } catch { return {}; }
}

async function persistir(rootDir, valor) {
  if (!rootDir) return;
  await mkdir(join(rootDir, 'estado'), { recursive: true });
  await writeFile(join(rootDir, ARQUIVO), JSON.stringify(valor, null, 2), 'utf8');
}

function threadPerdida(error) {
  return /thread (not found|n[aã]o encontrad)|unknown thread|no such thread|thread .* (expired|expirou)/i.test(String(error?.message ?? '')) && error?.code !== 'agent_unavailable';
}

function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
