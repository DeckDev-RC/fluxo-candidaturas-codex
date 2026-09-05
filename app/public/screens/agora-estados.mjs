// Decide o que a tela Agora mostra primeiro. A prioridade vem do estado
// persistido, não do último texto do chat (seção 5 do checklist de UI/UX).

export const ESTADOS = [
  'primeiro-uso', 'decisao-pendente', 'envio-incerto', 'acesso-indisponivel',
  'pausada', 'material-nao-lido', 'trabalhando', 'campanha-concluida',
  'sem-vaga-adequada', 'preparar-ambiente', 'pronta-para-buscar'
];

export function resolveNowState({ estado, jornada = {}, decisoes = [], perfil, ia = {} } = {}) {
  const campanha = estado?.campaign ?? {};
  const plataformas = (campanha.platforms ?? []).filter((item) => item.enabled !== false);
  const fatos = estado?.memory?.facts ?? {};
  const curriculo = (estado?.memory?.resumes ?? []).find((item) => item.selected) ?? null;
  const confirmados = Object.values(fatos).filter((fato) => fato?.confirmed === true).length;
  const fila = estado?.queue?.items ?? [];
  const candidaturas = estado?.applications ?? { items: [], confirmedCount: 0 };
  const meta = Number(campanha.totalGoal ?? 0);

  if (!perfil?.profile?.exists || !plataformas.length || confirmados === 0) {
    return { estado: 'primeiro-uso', motivo: 'Ainda não há objetivo, currículo lido e plataformas escolhidas.' };
  }
  if (decisoes.length) {
    return { estado: 'decisao-pendente', motivo: 'Há decisão que depende de você.', quantidade: decisoes.length };
  }
  if (jornada.status === 'incerto') {
    return { estado: 'envio-incerto', motivo: 'Um envio ficou sem confirmação da plataforma.' };
  }
  if (ia.disponivel === false && jornada.status && jornada.status !== 'concluida') {
    return { estado: 'acesso-indisponivel', motivo: ia.mensagem ?? 'A automação de IA não está conectada.' };
  }
  if (jornada.status === 'pausada') {
    return { estado: 'pausada', motivo: jornada.mensagem ?? 'Você pausou a jornada.' };
  }
  if (curriculo && !curriculo.sha256 && confirmados < 3) {
    return { estado: 'material-nao-lido', motivo: 'O currículo foi selecionado, mas a leitura ainda não terminou.' };
  }
  if (jornada.status === 'trabalhando' || jornada.status === 'decisao') {
    return { estado: 'trabalhando', motivo: jornada.mensagem ?? 'O Fluxo está trabalhando.' };
  }
  if (meta > 0 && candidaturas.confirmedCount >= meta) {
    return { estado: 'campanha-concluida', motivo: 'A meta de candidaturas confirmadas foi atingida.' };
  }
  if (buscaJaOcorreu(estado) && !fila.filter(disponivel).length) {
    return { estado: 'sem-vaga-adequada', motivo: 'A busca rodou e nenhuma vaga passou pelos critérios.' };
  }
  if (estado?.installation?.ready !== true) {
    return { estado: 'preparar-ambiente', motivo: 'A preparação do ambiente ainda tem pendência.' };
  }
  return { estado: 'pronta-para-buscar', motivo: 'Tudo confirmado para iniciar a busca.' };
}

export function disponivel(item) {
  return ['na fila', 'em preparação', 'pronta para revisão'].includes(item.status);
}

function buscaJaOcorreu(estado) {
  const descoberta = estado?.discovery ?? {};
  return Boolean(descoberta.collectedAt) || (descoberta.opportunities ?? []).length > 0 || (descoberta.failures ?? []).length > 0;
}
