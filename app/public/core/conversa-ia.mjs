// Cliente da conversa conduzida pela IA. Envia turnos e recebe, em tempo real,
// o que o agente diz e faz: cada ferramenta vira uma linha curta, cada espera
// pela pessoa vira estado visível, e "Pensando…" só fica aceso enquanto o turno
// corre de fato. Sem IA conectada este módulo não se conecta.

import { describeError, read, send } from './api.mjs';
import { isDemo, loadState, setConversation, setJourney, store } from './store.mjs';
import { amendStep, say, setThinking } from './conversa.mjs';

const CHAVE_ULTIMO = () => `fluxo-conversa-ia:ultimo${isDemo() ? ':demo' : ''}`;
const TIPOS = ['turn.started', 'tool.started', 'tool.completed', 'browser.tabs', 'waiting_user', 'assistant.message', 'turn.completed', 'turn.failed', 'conversation.reset'];
const NOMES = { GUPY: 'Gupy', INFOJOBS: 'InfoJobs', PANDAPE: 'PandaPé', LINKEDIN: 'LinkedIn', CATHO: 'Catho', VAGASCOM: 'Vagas.com', SOLIDES: 'Sólides' };

let fonte = null;
let tratarAcoes = () => {};
let recarga = null;
let esperaDoTurno = null;

export function agentDriving() {
  return store.ia.disponivel && !isDemo();
}

export function nomePlataforma(valor) {
  return NOMES[String(valor ?? '').toUpperCase()] ?? String(valor ?? 'a plataforma');
}

// Quem executa as ações propostas pelo agente (abrir área, objetivo, modalidades)
// se registra aqui; o cliente não conhece a interface.
export function onAgentActions(handler) { tratarAcoes = handler; }

export function connectConversation() {
  if (fonte || !agentDriving()) return;
  const desde = window.localStorage.getItem(CHAVE_ULTIMO()) ?? '';
  retomarEstado();
  fonte = new EventSource(`/api/v1/conversation/events?stream=1${desde ? `&desde=${encodeURIComponent(desde)}` : ''}`);
  for (const tipo of TIPOS) fonte.addEventListener(tipo, (evento) => { try { tratar(JSON.parse(evento.data)); } catch {} });
  fonte.onerror = () => {
    if (fonte?.readyState !== EventSource.CLOSED) return;
    fonte = null;
    setTimeout(connectConversation, 5000);
  };
}

// Ao reabrir a tela com um turno em curso, "Pensando…" e a situação voltam a refletir isso.
async function retomarEstado() {
  const status = await read('/api/v1/conversation/status', { fallback: null });
  if (!status?.busy) return;
  setThinking(true);
  setConversation({ ocupada: true });
  if (store.jornada.status !== 'trabalhando') setJourney({ runId: status.runId ?? store.jornada.runId, status: 'trabalhando', mensagem: 'Estou conduzindo a próxima etapa.' });
}

export function disconnectConversation() {
  fonte?.close();
  fonte = null;
}

// Um turno: a resposta chega pelo fluxo de eventos, não por aqui.
export async function sendTurn(texto, { system = false } = {}) {
  try {
    return await send('/api/v1/conversation/turn', { text: texto, system });
  } catch (error) {
    if (error.code === 'conversation_busy') { say('Ainda estou na etapa anterior. Aguarde um instante ou use "Pausar".', { tom: 'atencao' }); return null; }
    throw error;
  }
}

export async function interruptConversation() {
  return send('/api/v1/conversation/interrupt', {});
}

export async function resetConversation() {
  return send('/api/v1/conversation/reset', {});
}

function tratar(evento) {
  if (evento.id) window.localStorage.setItem(CHAVE_ULTIMO(), evento.id);
  const acao = TRATADORES[evento.type];
  if (acao) acao(evento);
}

const TRATADORES = {
  'turn.started': (evento) => {
    esperaDoTurno = null;
    setThinking(true);
    setConversation({ ocupada: true, aguardando: null });
    if (store.jornada.status && store.jornada.status !== 'encerrada' && !evento.system) setJourney({ status: 'trabalhando', mensagem: 'Estou conduzindo a próxima etapa.' });
    if (evento.system) setJourney({ status: 'trabalhando', mensagem: 'Continuando de onde parei.' });
  },
  'tool.started': (evento) => { if (evento.summary) say(evento.summary, { tom: 'passo' }); },
  'tool.completed': (evento) => {
    if (evento.summary) amendStep(evento.summary, { tom: evento.ok ? 'passo' : 'atencao' });
    agendarRecarga();
  },
  'browser.tabs': (evento) => setConversation({ abas: evento.tabs ?? [] }),
  waiting_user: (evento) => {
    esperaDoTurno = evento;
    setConversation({ aguardando: evento });
  },
  'assistant.message': (evento) => {
    if (evento.text) say(evento.text);
    if (evento.actions?.length) tratarAcoes(evento.actions);
  },
  'turn.completed': () => {
    setThinking(false);
    setConversation({ ocupada: false });
    if (store.jornada.status === 'trabalhando') setJourney({ status: 'aguardando', mensagem: textoDaEspera(esperaDoTurno) });
    agendarRecarga();
  },
  'turn.failed': (evento) => {
    setThinking(false);
    setConversation({ ocupada: false });
    const interrompido = evento.code === 'conversation_interrupted';
    if (!interrompido) say(evento.message || describeError(evento), { tom: 'erro' });
    if (store.jornada.status === 'trabalhando') setJourney({ status: interrompido ? 'pausada' : 'aguardando', mensagem: interrompido ? 'Você interrompeu a etapa em curso.' : 'A última etapa falhou. Você pode pedir para eu tentar de novo.' });
  },
  'conversation.reset': () => setConversation({ ocupada: false, aguardando: null, abas: [] })
};

function textoDaEspera(espera) {
  if (!espera) return 'Terminei esta etapa e aguardo o seu próximo pedido.';
  if (espera.kind === 'login') return `Entre no ${nomePlataforma(espera.platform)} na janela do navegador e avise quando terminar.`;
  if (espera.kind === 'challenge') return `O ${nomePlataforma(espera.platform)} pediu uma verificação; resolva na janela do navegador e avise quando terminar.`;
  if (espera.kind === 'approval') return 'Preparei uma candidatura; revise e aprove ou rejeite o envio.';
  return 'Preciso de você para continuar.';
}

// Várias ferramentas seguidas recarregam o estado uma vez só.
function agendarRecarga() {
  clearTimeout(recarga);
  recarga = setTimeout(() => { loadState(); }, 400);
}
