// Estado da aplicação lido do serviço local. A leitura dos dados do candidato
// nunca depende do runtime de IA: painéis de IA carregam depois, em separado.

import { read } from './api.mjs';
import { dataHora } from './format.mjs';

const ouvintes = new Set();

export const store = {
  carregando: false,
  demo: false,
  erro: '',
  atualizadoEm: null,
  estado: null,
  aprovacoes: [],
  perfil: null,
  plataformas: [],
  politica: null,
  metricas: null,
  pendencias: [],
  avaliacoes: [],
  agenda: [],
  notificacoes: [],
  ia: {
    disponivel: false,
    mensagem: 'Verificando a automação de IA…',
    modo: '',
    provedor: 'skynet',
    provedores: { skynet: { available: false }, codex: { available: false } },
    consentimentos: {},
    capacidades: { chat: false, tools: false, autopilot: false }
  },
  codex: null,
  jornada: { runId: '', status: '', mensagem: '', plano: [], perguntas: [], atualizacoes: [] },
  // Conversa conduzida pela IA: se há turno em curso, o que ela espera de você e as abas do navegador.
  conversa: { ocupada: false, aguardando: null, abas: [], cartao: null }
};

export function subscribe(listener) {
  ouvintes.add(listener);
  return () => ouvintes.delete(listener);
}

// Um ouvinte que lança não pode impedir os demais de repintar.
export function notify() {
  for (const listener of ouvintes) {
    try { listener(store); } catch (error) { console.error('ouvinte do estado falhou', error); }
  }
}

export function isDemo() {
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

// Demonstração identificada: dados fictícios, com aviso permanente na tela.
async function loadDemo() {
  const fixture = await read('/fixtures/ui-state.json');
  Object.assign(store, {
    demo: true,
    estado: fixture.state,
    aprovacoes: lista(fixture.approvals),
    perfil: fixture.profile,
    plataformas: lista(fixture.platforms),
    politica: { policy: { requireFinalConfirmation: true }, limits: {}, lifecycle: 'Demonstração local: nenhuma ação externa acontece neste modo.' },
    metricas: fixture.metrics,
    pendencias: lista(fixture.pending),
    avaliacoes: lista(fixture.assessments),
    agenda: [],
    notificacoes: [],
    erro: '',
    atualizadoEm: new Date()
  });
  store.estado.memory = fixture.memory ?? store.estado.memory;
  store.jornada = { ...store.jornada, ...fixture.autopilot, status: 'trabalhando', plano: fixture.autopilot?.plan ?? [], perguntas: [] };
  store.ia = {
    disponivel: true,
    mensagem: 'Demonstração local: a automação não é acionada.',
    modo: 'demonstracao',
    provedor: 'codex',
    provedores: { codex: { available: true }, skynet: { available: false } },
    consentimentos: {},
    capacidades: { chat: true, tools: false, autopilot: false }
  };
  store.codex = fixture.codex ?? null;
  return store;
}

export async function loadState() {
  store.carregando = true;
  notify();
  try {
    if (isDemo()) return await loadDemo();
    const [estado, aprovacoes, perfil, plataformas, politica, metricas, pendencias, avaliacoes, agenda, notificacoes] = await Promise.all([
      read('/api/v1/state'),
      read('/api/v1/approvals', { fallback: [] }),
      read('/api/v1/profile', { fallback: null }),
      read('/api/v1/platforms', { fallback: [] }),
      read('/api/v1/product/policy', { fallback: null }),
      read('/api/v1/metrics', { fallback: null }),
      read('/api/v1/pending', { fallback: [] }),
      read('/api/v1/assessments', { fallback: [] }),
      read('/api/v1/scheduler/jobs', { fallback: [] }),
      read('/api/v1/notifications', { fallback: [] })
    ]);
    Object.assign(store, {
      estado, aprovacoes: lista(aprovacoes), perfil, plataformas: lista(plataformas), politica,
      metricas, pendencias: lista(pendencias), avaliacoes: lista(avaliacoes),
      agenda: lista(agenda.jobs ?? agenda), notificacoes: lista(notificacoes.notifications ?? notificacoes),
      erro: '', atualizadoEm: new Date()
    });
  } catch (error) {
    store.erro = error.message;
  } finally {
    store.carregando = false;
    notify();
  }
  return store;
}

export async function loadAiStatus() {
  if (isDemo()) return store.ia;
  const saude = await read('/api/v1/runtime/health', { fallback: null });
  return setAiHealth(saude, saude?.mode ?? '');
}

// Um retrato da saúde do runtime, venha de consulta ou de evento, vira o mesmo estado.
export function setAiHealth(saude, modo = saude?.mode ?? '') {
  // Conta que entra ou sai invalida o retrato de conta, uso e limites.
  const codexAvailable = saude?.providers?.codex?.available === true;
  if (codexAvailable !== (store.ia.provedores?.codex?.available === true)) store.codex = null;
  store.ia = {
    disponivel: saude?.available === true,
    estado: saude?.state ?? '',
    motivo: saude?.reason ?? '',
    erroLogin: saude?.loginError ?? '',
    provedor: saude?.conversationProvider ?? saude?.provider ?? 'skynet',
    provedores: saude?.providers ?? { skynet: { available: false }, codex: { available: saude?.available === true } },
    consentimentos: saude?.providerPreferences?.consents ?? {},
    capacidades: saude?.capabilities ?? { chat: saude?.available === true, tools: saude?.available === true, autopilot: saude?.available === true },
    mensagem: saude?.available === true
      ? saude?.message ?? 'Inteligência artificial conectada.'
      : saude?.loginError ?? saude?.message ?? 'A automação de IA não está conectada. Você continua podendo revisar e decidir.',
    modo: modo ?? ''
  };
  notify();
  return store.ia;
}

export function setJourney(patch) {
  store.jornada = { ...store.jornada, ...patch };
  notify();
}

export function setConversation(patch) {
  store.conversa = { ...store.conversa, ...patch };
  notify();
}

export function addJourneyUpdate(update) {
  store.jornada = {
    ...store.jornada,
    atualizacoes: [...store.jornada.atualizacoes, update].slice(-40)
  };
  notify();
}

export function decisions() {
  // Revisão vencida não é decisão possível: o serviço a recusa e a IA gera outra.
  const agora = Date.now();
  const pendentes = store.aprovacoes.filter((item) => item.status === 'pending' && (!item.expiresAt || new Date(item.expiresAt).getTime() > agora));
  const perguntas = store.jornada.perguntas.length
    ? [{ tipo: 'informacao', id: `lacuna:${store.jornada.runId}`, titulo: 'Confirmar uma informação', detalhe: store.jornada.mensagem }]
    : [];
  const excecoes = (store.estado?.exceptions ?? [])
    .filter((item) => item.status !== 'resolved')
    .map((item) => ({ tipo: 'excecao', id: item.id, titulo: item.message ?? 'Situação que precisa de você', detalhe: item.nextAction ?? '' }));
  const incertos = (store.estado?.queue?.items ?? [])
    .filter((item) => item.status === 'bloqueada')
    .map((item) => ({ tipo: 'bloqueio', id: item.id, titulo: `${item.role ?? 'Vaga'} — ${item.company ?? 'empresa não informada'}`, detalhe: item.lastError ?? 'Bloqueio registrado na fila.' }));
  return [
    ...pendentes.map((item) => ({ tipo: 'aprovacao', id: item.id, titulo: tituloAprovacao(item), detalhe: item.expiresAt ? `Expira em ${dataHora(item.expiresAt)}` : 'Sem prazo de validade informado', aprovacao: item })),
    ...perguntas,
    ...excecoes,
    ...incertos
  ];
}

function tituloAprovacao(item) {
  const kinds = {
    submission: 'Revisar e aprovar um envio',
    sensitive_data: 'Autorizar uma informação sensível',
    timed_test: 'Autorizar início de teste cronometrado',
    message: 'Aprovar mensagem a recrutador',
    browser_action: 'Autorizar ação no navegador',
    withdrawal: 'Confirmar desistência',
    profile_change: 'Confirmar mudança de perfil'
  };
  return kinds[item.kind] ?? 'Decisão pendente';
}

function lista(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}
