// Acompanhamento da jornada em curso. A conexão é automática e a reconexão
// aparece quando falha: ninguém precisa apertar "conectar" (U9-05).
// O histórico reenviado a cada conexão reconstrói o estado, mas não gera
// linha nova na conversa: cada evento é reconhecido pelo identificador.

import { addJourneyUpdate, loadState, setJourney } from './store.mjs';

const TIPOS = [
  'autopilot.plan.created', 'autopilot.task.started', 'autopilot.task.completed',
  'autopilot.waiting_user', 'autopilot.completed', 'autopilot.exception', 'autopilot.failed', 'autopilot.retry',
  'autopilot.human.rejected', 'autopilot.turn.completed',
  'application.prepared', 'application.fields.filled', 'application.submission_confirmed',
  'run.needs_reconcile'
];

// Eventos que mudam o que está persistido: o retrato do estado é relido.
const RELER_ESTADO = new Set(['autopilot.waiting_user', 'autopilot.completed', 'autopilot.exception', 'autopilot.failed', 'application.prepared', 'application.submission_confirmed', 'run.needs_reconcile']);

const ROTULOS = {
  intake: 'Entender seu perfil',
  discovery: 'Encontrar oportunidades',
  fit: 'Comparar aderência',
  application: 'Preparar candidaturas',
  followup: 'Acompanhar processos'
};

const CHAVE_RUN = 'fluxo-jornada';
const CHAVE_VISTOS = 'fluxo-jornada-eventos';
const LIMITE_VISTOS = 400;
const TENTATIVAS_ANTES_DE_CONFERIR = 3;

let fonte = null;
let runAtual = '';
let tentativas = 0;
let reconexao = null;
let vistos = carregarVistos();
let releitura = null;

export function connectJourney(runId) {
  const id = String(runId ?? '');
  if (!id || id === runAtual && fonte) return;
  disconnectJourney();
  runAtual = id;
  try { window.localStorage.setItem(CHAVE_RUN, id); } catch {}
  abrir();
}

export function restoreJourney() {
  let salvo = '';
  try { salvo = window.localStorage.getItem(CHAVE_RUN) ?? ''; } catch {}
  if (salvo) connectJourney(salvo);
  return salvo;
}

export function disconnectJourney() {
  clearTimeout(reconexao);
  fonte?.close();
  fonte = null;
}

// Jornada encerrada de propósito não volta como "trabalhando" ao reabrir.
export function forgetJourney() {
  disconnectJourney();
  runAtual = '';
  tentativas = 0;
  try { window.localStorage.removeItem(CHAVE_RUN); } catch {}
  setJourney({ conexao: '' });
}

function abrir() {
  fonte = new EventSource(`/api/v1/runs/${encodeURIComponent(runAtual)}/events?stream=1`);
  fonte.onopen = () => { tentativas = 0; setJourney({ conexao: 'conectada' }); };
  fonte.onerror = async () => {
    fonte?.close();
    fonte = null;
    tentativas += 1;
    // Depois de algumas falhas, conferir se a execução ainda existe: uma que
    // sumiu do serviço não justifica tentar para sempre.
    if (tentativas >= TENTATIVAS_ANTES_DE_CONFERIR && !(await execucaoExiste())) { forgetJourney(); return; }
    const espera = Math.min(1000 * 2 ** (tentativas - 1), 15000);
    setJourney({ conexao: 'reconectando', esperaMs: espera });
    reconexao = setTimeout(abrir, espera);
  };
  for (const tipo of TIPOS) fonte.addEventListener(tipo, (evento) => receber(tipo, evento));
}

function receber(tipo, evento) {
  const id = String(evento.lastEventId ?? '');
  const repetido = Boolean(id) && vistos.has(id);
  aplicar(tipo, parse(evento.data), { repetido });
  if (id && !repetido) lembrar(id);
  if (!repetido && RELER_ESTADO.has(tipo)) agendarReleitura();
}

function aplicar(tipo, payload, { repetido }) {
  const linha = (tom, texto) => { if (!repetido) addJourneyUpdate({ tom, texto }); };
  const tarefa = ROTULOS[payload.task] ?? payload.task ?? 'tarefa';
  if (tipo === 'autopilot.plan.created') {
    setJourney({ runId: runAtual, status: 'trabalhando', plano: comRotulos(payload.plan), perguntas: [], mensagem: 'A jornada começou.' });
  }
  if (tipo === 'autopilot.task.started') linha('informacao', `Começou: ${tarefa}.`);
  if (tipo === 'autopilot.retry') linha('atencao', `Nova tentativa em ${tarefa}.`);
  if (tipo === 'autopilot.task.completed') {
    setJourney({ status: 'trabalhando', mensagem: descreveResultado(payload, tarefa) });
    linha('sucesso', descreveResultado(payload, tarefa));
  }
  if (tipo === 'autopilot.waiting_user') {
    setJourney({
      runId: payload.runId ?? runAtual,
      status: 'decisao',
      mensagem: payload.message ?? 'A jornada precisa de uma informação sua.',
      plano: comRotulos(payload.plan),
      perguntas: Array.isArray(payload.questions) ? payload.questions : []
    });
    linha('atencao', payload.message ?? 'Uma decisão espera por você.');
  }
  if (tipo === 'autopilot.exception' || tipo === 'autopilot.failed') {
    const mensagem = payload.message ?? (payload.error ? `A jornada parou por uma falha: ${payload.error}` : 'A jornada parou por uma falha.');
    setJourney({ status: 'bloqueio', mensagem, plano: comRotulos(payload.plan) });
    linha('erro', mensagem);
  }
  if (tipo === 'autopilot.completed') {
    setJourney({ status: 'concluida', mensagem: 'A jornada terminou com resultados confirmados.', perguntas: [] });
  }
  if (tipo === 'autopilot.turn.completed') linha('informacao', 'Etapa concluída; a campanha continua na próxima tarefa autorizada.');
  if (tipo === 'run.needs_reconcile') setJourney({ status: 'incerto', mensagem: 'Um envio ficou com resultado incerto e precisa de conferência.' });
  if (tipo === 'application.prepared') linha('informacao', 'Candidatura preparada para sua revisão.');
  if (tipo === 'application.fields.filled') linha('informacao', 'Campos preenchidos com informações confirmadas.');
  if (tipo === 'application.submission_confirmed') linha('sucesso', 'A plataforma confirmou o recebimento da candidatura.');
}

function descreveResultado(payload, tarefa) {
  const observacao = payload.result?.observation;
  return observacao ? `${tarefa}: ${observacao}` : `Etapa concluída: ${tarefa}.`;
}

function comRotulos(plano) {
  return (Array.isArray(plano) ? plano : []).map((etapa) => ({ ...etapa, label: ROTULOS[etapa.id] ?? etapa.label ?? etapa.id }));
}

// Vários eventos chegam juntos; uma releitura basta.
function agendarReleitura() {
  clearTimeout(releitura);
  releitura = setTimeout(() => { loadState().catch(() => {}); }, 300);
}

async function execucaoExiste() {
  try { return (await fetch(`/api/v1/runs/${encodeURIComponent(runAtual)}/events`, { cache: 'no-store' })).status !== 404; }
  catch { return true; }
}

function lembrar(id) {
  vistos.add(id);
  if (vistos.size > LIMITE_VISTOS) vistos = new Set([...vistos].slice(-LIMITE_VISTOS));
  try { window.localStorage.setItem(CHAVE_VISTOS, JSON.stringify([...vistos])); } catch {}
}

function carregarVistos() {
  try { return new Set(JSON.parse(window.localStorage.getItem(CHAVE_VISTOS) ?? '[]')); } catch { return new Set(); }
}

function parse(data) {
  try { return JSON.parse(data); } catch { return {}; }
}
