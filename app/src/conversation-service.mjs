// Conversa com o Fluxo: cada mensagem da pessoa vira um turno real no Codex
// app-server, com o retrato atual do estado local como contexto. O modelo
// explica, orienta e propõe; não executa ação externa e não decide aprovação.
// A conversa não tem ferramentas: o que muda dados passa pelos portões da
// interface (diálogos de confirmação), nunca por texto livre.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { INSTRUCOES_DA_CONVERSA, montarContexto } from './conversation-prompt.mjs';

const ARQUIVO = 'estado/conversa.json';
const PRAZO_TURNO_MS = 120_000;
// Linhas finais "AÇÃO: ..." que a interface sabe executar com confirmação da pessoa.
const ACOES = /^AÇÃO:\s*(abrir|objetivo|modalidades)\s*=\s*(.+)$/imu;

export function createConversationService({ agentAdapter, snapshot = async () => ({}), rootDir = '', now = () => new Date(), timeoutMs = PRAZO_TURNO_MS } = {}) {
  if (!agentAdapter?.request) throw new TypeError('A conversa requer o adaptador do agente.');
  let threadId = '';
  let carregado = false;
  const turnosAbertos = new Map();

  return {
    // Notificações do app-server pertencentes à conversa: texto do assistente e fim do turno.
    handleNotification(message) {
      const params = message?.params ?? {};
      const alvo = String(params.threadId ?? params.thread?.id ?? '');
      if (!threadId || alvo !== threadId) return false;
      const turnId = String(params.turnId ?? params.turn?.id ?? '');
      const aberto = turnosAbertos.get(turnId) ?? [...turnosAbertos.values()].at(-1);
      if (!aberto) return true;
      if (message.method === 'item/completed' && params.item?.type === 'agentMessage') aberto.textos.push(String(params.item.text ?? ''));
      if (message.method === 'turn/completed') aberto.concluir(params.turn?.status ?? 'completed');
      if (message.method === 'error' || params.error) aberto.falhar(new Error(String(params.error?.message ?? params.message ?? 'O turno falhou.')));
      return true;
    },

    async turn(texto) {
      const pedido = String(texto ?? '').trim();
      if (!pedido) throw domainError('conversation_empty', 'Escreva algo para o Fluxo responder.');
      await this.ensureThread();
      const contexto = montarContexto(await snapshot(), now());
      const entrada = `${contexto}\n\nPessoa: ${pedido}`;
      const coleta = abrirColeta(turnosAbertos, timeoutMs);
      let resultado;
      try {
        resultado = await agentAdapter.runTurn(threadId, entrada);
        const turnId = String(resultado?.turn?.id ?? '');
        if (turnId) turnosAbertos.set(turnId, coleta);
        const status = await coleta.promessa;
        const bruto = coleta.textos.join('\n').trim();
        const { resposta, acoes } = separarAcoes(bruto);
        return { reply: resposta || 'Não consegui formular uma resposta agora. Tente de novo em instantes.', actions: acoes, threadId, status };
      } catch (error) {
        // Sessão perdida no app-server (reinício, logout): a próxima mensagem abre outra.
        if (/thread|not found|unknown/i.test(String(error?.message ?? '')) && error?.code !== 'agent_unavailable') { threadId = ''; await persistir(rootDir, { threadId: '' }); }
        throw error;
      } finally {
        for (const [id, item] of turnosAbertos) if (item === coleta) turnosAbertos.delete(id);
      }
    },

    async ensureThread() {
      if (!carregado) { threadId = (await carregar(rootDir)).threadId ?? ''; carregado = true; }
      if (threadId) return threadId;
      const iniciado = await agentAdapter.startThread({ metadata: { mode: 'fluxo-conversa' }, developerInstructions: INSTRUCOES_DA_CONVERSA, conversation: true });
      threadId = String(iniciado?.thread?.id ?? iniciado?.threadId ?? '');
      if (!threadId) throw domainError('conversation_thread_failed', 'O Codex não abriu uma conversa.');
      await persistir(rootDir, { threadId, startedAt: now().toISOString() });
      return threadId;
    },

    async reset() { threadId = ''; carregado = true; await persistir(rootDir, { threadId: '' }); }
  };
}

function abrirColeta(turnosAbertos, timeoutMs) {
  const coleta = { textos: [] };
  coleta.promessa = new Promise((resolve, reject) => {
    const prazo = setTimeout(() => reject(domainError('conversation_timeout', 'O Fluxo demorou demais para responder. Tente de novo.')), timeoutMs);
    coleta.concluir = (status) => { clearTimeout(prazo); resolve(status); };
    coleta.falhar = (error) => { clearTimeout(prazo); reject(error); };
  });
  return coleta;
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

function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
