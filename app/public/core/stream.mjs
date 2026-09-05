// Acompanhamento da jornada em curso. A conexão é automática e a reconexão
// aparece quando falha: ninguém precisa apertar "conectar" (U9-05).

import { addJourneyUpdate, setJourney } from './store.mjs';

const TIPOS = [
  'autopilot.plan.created', 'autopilot.task.started', 'autopilot.task.completed',
  'autopilot.waiting_user', 'autopilot.completed', 'autopilot.exception', 'autopilot.retry',
  'autopilot.human.rejected', 'autopilot.turn.completed',
  'application.prepared', 'application.fields.filled', 'application.submission_confirmed',
  'run.paused', 'run.resumed', 'run.needs_reconcile'
];

const ROTULOS = {
  intake: 'Entender seu perfil',
  discovery: 'Encontrar oportunidades',
  fit: 'Comparar aderência',
  application: 'Preparar candidaturas',
  followup: 'Acompanhar processos'
};

let fonte = null;
let runAtual = '';
let tentativas = 0;
let reconexao = null;

export function connectJourney(runId) {
  const id = String(runId ?? '');
  if (!id || id === runAtual && fonte) return;
  disconnectJourney();
  runAtual = id;
  try { window.localStorage.setItem('fluxo-jornada', id); } catch {}
  abrir();
}

export function restoreJourney() {
  let salvo = '';
  try { salvo = window.localStorage.getItem('fluxo-jornada') ?? ''; } catch {}
  if (salvo) connectJourney(salvo);
  return salvo;
}

export function disconnectJourney() {
  clearTimeout(reconexao);
  fonte?.close();
  fonte = null;
}

function abrir() {
  fonte = new EventSource(`/api/v1/runs/${encodeURIComponent(runAtual)}/events?stream=1`);
  fonte.onopen = () => { tentativas = 0; setJourney({ conexao: 'conectada' }); };
  fonte.onerror = () => {
    fonte?.close();
    fonte = null;
    tentativas += 1;
    const espera = Math.min(1000 * 2 ** (tentativas - 1), 15000);
    setJourney({ conexao: 'reconectando', esperaMs: espera });
    reconexao = setTimeout(abrir, espera);
  };
  for (const tipo of TIPOS) fonte.addEventListener(tipo, (evento) => aplicar(tipo, parse(evento.data)));
}

function aplicar(tipo, payload) {
  if (tipo === 'autopilot.plan.created') {
    setJourney({ runId: runAtual, status: 'trabalhando', plano: comRotulos(payload.plan), perguntas: [], mensagem: 'A jornada começou.' });
  }
  if (tipo === 'autopilot.task.started') {
    addJourneyUpdate({ tom: 'informacao', texto: `Começou: ${ROTULOS[payload.task] ?? payload.task}.` });
  }
  if (tipo === 'autopilot.retry') {
    addJourneyUpdate({ tom: 'atencao', texto: `Nova tentativa em ${ROTULOS[payload.task] ?? payload.task}.` });
  }
  if (tipo === 'autopilot.task.completed') {
    setJourney({ status: 'trabalhando', mensagem: descreveResultado(payload) });
    addJourneyUpdate({ tom: 'sucesso', texto: descreveResultado(payload) });
  }
  if (tipo === 'autopilot.waiting_user') {
    setJourney({
      runId: payload.runId ?? runAtual,
      status: 'decisao',
      mensagem: payload.message ?? 'A jornada precisa de uma informação sua.',
      plano: comRotulos(payload.plan),
      perguntas: Array.isArray(payload.questions) ? payload.questions : []
    });
    addJourneyUpdate({ tom: 'atencao', texto: payload.message ?? 'Uma decisão espera por você.' });
  }
  if (tipo === 'autopilot.exception') {
    setJourney({ status: 'bloqueio', mensagem: payload.message ?? 'A jornada parou por uma falha.', plano: comRotulos(payload.plan) });
    addJourneyUpdate({ tom: 'erro', texto: payload.message ?? 'A jornada parou por uma falha.' });
  }
  if (tipo === 'autopilot.completed') {
    setJourney({ status: 'concluida', mensagem: 'A jornada terminou com resultados confirmados.', perguntas: [] });
  }
  if (tipo === 'autopilot.turn.completed') {
    addJourneyUpdate({ tom: 'informacao', texto: 'Etapa concluída; a campanha continua na próxima tarefa autorizada.' });
  }
  if (tipo === 'run.paused') setJourney({ status: 'pausada', mensagem: payload.reason ?? 'A jornada está pausada.' });
  if (tipo === 'run.resumed') setJourney({ status: 'trabalhando', mensagem: 'A jornada foi retomada.' });
  if (tipo === 'run.needs_reconcile') setJourney({ status: 'incerto', mensagem: 'Um envio ficou com resultado incerto e precisa de conferência.' });
  if (tipo === 'application.prepared') addJourneyUpdate({ tom: 'informacao', texto: 'Candidatura preparada para sua revisão.' });
  if (tipo === 'application.fields.filled') addJourneyUpdate({ tom: 'informacao', texto: 'Campos preenchidos com informações confirmadas.' });
  if (tipo === 'application.submission_confirmed') addJourneyUpdate({ tom: 'sucesso', texto: 'A plataforma confirmou o recebimento da candidatura.' });
}

function descreveResultado(payload) {
  const tarefa = ROTULOS[payload.task] ?? payload.task;
  const observacao = payload.result?.observation;
  return observacao ? `${tarefa}: ${observacao}` : `${tarefa} concluída.`;
}

function comRotulos(plano) {
  return (Array.isArray(plano) ? plano : []).map((etapa) => ({ ...etapa, label: ROTULOS[etapa.id] ?? etapa.label ?? etapa.id }));
}

function parse(data) {
  try { return JSON.parse(data); } catch { return {}; }
}
