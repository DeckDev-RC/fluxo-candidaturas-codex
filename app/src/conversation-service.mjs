// Conversa com o Fluxo = o agente condutor. Cada mensagem da pessoa vira um
// turno real no Codex app-server, em uma thread com as ferramentas fluxo_*,
// dona de um run desta sessão. O agente lê, pergunta, abre o navegador, busca,
// compara e preenche; os portões (aprovação, dado sensível, CAPTCHA/MFA) ficam
// no código, fora da vontade do modelo. Tudo o que acontece vira evento para a
// tela: texto do assistente, cada ferramenta chamada, esperas pela pessoa.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { INSTRUCOES_DA_CONVERSA, montarContexto } from './conversation-prompt.mjs';
import { resumirFerramenta } from './conversation-narration.mjs';

const ARQUIVO = 'estado/conversa.json';
const PRAZO_TURNO_MS = 15 * 60 * 1000;
const HISTORICO_EVENTOS = 200;
// Linhas finais "AÇÃO: ..." que a interface sabe executar com confirmação da pessoa.
const ACOES = /^AÇÃO:\s*(abrir|objetivo|modalidades)\s*=\s*(.+)$/imu;

export function createConversationService({ agentAdapter, snapshot = async () => ({}), rootDir = '', runService = null, tabs = null, now = () => new Date(), timeoutMs = PRAZO_TURNO_MS } = {}) {
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
  const ouvintes = new Set();
  const historico = [];

  const service = {
    // Notificações do app-server pertencentes à conversa: texto e fim do turno.
    handleNotification(message) {
      const params = message?.params ?? {};
      const alvo = String(params.threadId ?? params.thread?.id ?? '');
      if (!threadId || alvo !== threadId) return false;
      const turno = turnoAtivo;
      if (!turno) return true;
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
        if (resumo.espera) emitir('waiting_user', resumo.espera);
        if (chamada.ok && ['fluxo_open_platform', 'fluxo_browser_status'].includes(chamada.tool)) publicarAbas(chamada.result);
      }
      registrar('conversation.tool', { tool: chamada.tool, phase: chamada.phase, ok: chamada.ok ?? null, summary: chamada.phase === 'started' ? resumo.inicio : resumo.fim });
      return true;
    },

    // Turno assíncrono: devolve o identificador e segue emitindo eventos.
    async turn(texto, { system = false } = {}) {
      const pedido = String(texto ?? '').trim();
      if (!pedido) throw domainError('conversation_empty', 'Escreva algo para o Fluxo responder.');
      if (turnoAtivo) throw domainError('conversation_busy', 'O Fluxo ainda está trabalhando na mensagem anterior. Aguarde ou interrompa.');
      await this.ensureThread();
      await ensureRun();
      // O primeiro turno de cada processo avisa que o app foi reaberto: a thread
      // retomada lembra o que estava fazendo, mas nada disso continua em curso.
      const contexto = montarContexto(await snapshot(), now(), { sessaoNova: primeiroTurnoDaSessao && retomadaDeGravacao });
      primeiroTurnoDaSessao = false;
      const entrada = `${contexto}\n\n${system ? 'SISTEMA (evento da interface, não é fala da pessoa)' : 'Pessoa'}: ${pedido}`;
      const turno = abrirTurno();
      turnoAtivo = turno;
      registrar(system ? 'conversation.system' : 'conversation.user', { text: pedido });
      emitir('turn.started', { turnId: turno.id, system });
      try {
        turno.codexTurnId = await iniciarTurnoNoAgente(entrada);
      } catch (error) {
        falharTurno(error);
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
      if (!carregado) { threadId = (await carregar(rootDir)).threadId ?? ''; carregado = true; }
      if (threadId && retomada === threadId) return threadId;
      const parametros = { metadata: { mode: 'fluxo-condutor' }, developerInstructions: INSTRUCOES_DA_CONVERSA };
      if (threadId && agentAdapter.resumeThread) {
        try { await agentAdapter.resumeThread(threadId, parametros); retomada = threadId; retomadaDeGravacao = true; return threadId; }
        catch (error) { if (!threadPerdida(error)) throw error; threadId = ''; }
      }
      const iniciado = await agentAdapter.startThread(parametros);
      threadId = String(iniciado?.thread?.id ?? iniciado?.threadId ?? '');
      if (!threadId) throw domainError('conversation_thread_failed', 'O Codex não abriu uma conversa.');
      retomada = threadId;
      await persistir(rootDir, { threadId, startedAt: now().toISOString() });
      return threadId;
    },

    async reset({ silencioso = false } = {}) {
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
  async function iniciarTurnoNoAgente(entrada) {
    try {
      const resultado = await agentAdapter.runTurnForRun(runId, threadId, entrada);
      return String(resultado?.turn?.id ?? '');
    } catch (error) {
      if (!threadPerdida(error)) throw error;
      threadId = ''; retomada = '';
      await persistir(rootDir, { threadId: '' });
      await service.ensureThread();
      agentAdapter.bindRun?.(runId, threadId);
      runService?.setAgentThread?.(runId, threadId);
      try {
        const resultado = await agentAdapter.runTurnForRun(runId, threadId, entrada);
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
    return runId;
  }

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
  return { resposta: semMarkdown(linhas.join('\n')), acoes };
}

function semMarkdown(texto) {
  return texto
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .trim();
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
