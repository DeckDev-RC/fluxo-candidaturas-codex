// Decide o que a tela Agora mostra primeiro. A prioridade vem do estado
// persistido, não do último texto do chat (seção 5 do checklist de UI/UX).

export const ESTADOS = [
  'primeiro-uso', 'decisao-pendente', 'envio-incerto', 'acesso-indisponivel',
  'aguardando-voce', 'pausada', 'material-nao-lido', 'escolher-vaga', 'trabalhando', 'campanha-concluida',
  'sem-vaga-adequada', 'preparar-ambiente', 'pronta-para-buscar'
];

// O que o Fluxo diz em cada situação. É a fala atual da conversa e também a
// linha registrada quando a situação muda.
export const TEXTOS = {
  'primeiro-uso': {
    titulo: 'Vamos começar pelo seu objetivo',
    corpo: 'Diga o que você quer alcançar e importe seu currículo. Eu leio o documento, mostro o que entendi e pergunto apenas o que faltar.'
  },
  'decisao-pendente': {
    titulo: 'Há uma decisão esperando por você',
    corpo: 'Parei de propósito nesta etapa. Nada é enviado sem a sua aprovação.'
  },
  'envio-incerto': {
    titulo: 'Um envio ficou sem confirmação',
    corpo: 'A plataforma não sinalizou o recebimento. Confira a página antes de qualquer nova tentativa: eu não repito o clique por conta própria.'
  },
  'acesso-indisponivel': {
    titulo: 'A automação de IA está indisponível',
    corpo: 'Seus dados continuam acessíveis e você pode revisar, corrigir e decidir. A busca automática volta quando o acesso for restabelecido.'
  },
  'aguardando-voce': {
    titulo: 'Preciso de você para continuar',
    corpo: 'Parei nesta etapa porque ela depende de você. Para login, verificação ou cookies eu percebo sozinho quando terminar; se preferir, use o botão para me avisar.'
  },
  pausada: {
    titulo: 'Jornada pausada por você',
    corpo: 'O ponto de retomada está salvo. Nenhuma nova ação externa será iniciada até você retomar.'
  },
  'material-nao-lido': {
    titulo: 'Ainda estou lendo seu currículo',
    corpo: 'O arquivo foi transferido e verificado. A leitura e a sua revisão são etapas separadas: nada é usado antes de você confirmar.'
  },
  'escolher-vaga': {
    titulo: 'Encontrei vagas; escolha qual preparar',
    corpo: 'Comparei as oportunidades com seus dados confirmados. Preparo a candidatura da que você escolher e paro para você revisar antes de qualquer envio.'
  },
  trabalhando: {
    titulo: 'Estou trabalhando',
    corpo: 'Você acompanha cada etapa ao lado e pode pausar quando quiser. Só chamo você quando uma decisão depender de você.'
  },
  'campanha-concluida': {
    titulo: 'A meta desta campanha foi atingida',
    corpo: 'Os resultados estão registrados. Terminar a busca não encerra os processos em andamento: continue acompanhando as respostas.'
  },
  'sem-vaga-adequada': {
    titulo: 'Nenhuma vaga passou pelos seus critérios',
    corpo: 'Isto não é uma falha. Você pode ajustar os filtros, manter o acompanhamento agendado ou encerrar a campanha.'
  },
  'preparar-ambiente': {
    titulo: 'Falta preparar o ambiente deste computador',
    corpo: 'Uma dependência necessária ainda não está pronta. A verificação diz o que falta, para que serve e o que fazer.'
  },
  'pronta-para-buscar': {
    titulo: 'Tudo pronto para procurar vagas',
    corpo: 'Seu objetivo, seus dados confirmados e as plataformas escolhidas estão definidos.'
  }
};

export function resolveNowState({ estado, jornada = {}, decisoes = [], perfil, ia = {} } = {}) {
  const campanha = estado?.campaign ?? {};
  const plataformas = (campanha.platforms ?? []).filter((item) => item.enabled !== false);
  const fatos = estado?.memory?.facts ?? {};
  const curriculo = (estado?.memory?.resumes ?? []).find((item) => item.selected) ?? null;
  const confirmados = Object.values(fatos).filter((fato) => fato?.confirmed === true).length;
  const fila = estado?.queue?.items ?? [];
  const candidaturas = estado?.applications ?? { items: [], confirmedCount: 0 };
  const meta = Number(campanha.totalGoal ?? 0);

  // A memória confirmada é a fonte do perfil; o arquivo perfil/candidato.md
  // (onboarding legado) é só um dos caminhos. Quem passou pelo cartão de
  // primeiro uso tem fatos confirmados e plataformas, e não volta para ele.
  const perfilPronto = Boolean(perfil?.profile?.exists) || confirmados > 0;
  if (!perfilPronto || !plataformas.length || confirmados === 0) {
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
  // A IA condutora encerrou o turno esperando a pessoa (login, verificação, escolha).
  const metaAtingida = meta > 0 && candidaturas.confirmedCount >= meta;
  if (jornada.status === 'aguardando' && !metaAtingida) {
    return { estado: 'aguardando-voce', motivo: jornada.mensagem ?? 'A próxima etapa depende de você.' };
  }
  if (jornada.status === 'pausada') {
    return { estado: 'pausada', motivo: jornada.mensagem ?? 'Você pausou a jornada.' };
  }
  if (curriculo && !curriculo.sha256 && confirmados < 3) {
    return { estado: 'material-nao-lido', motivo: 'O currículo foi selecionado, mas a leitura ainda não terminou.' };
  }
  // A jornada parou esperando a pessoa, sem pergunta nem aprovação aberta: a
  // próxima etapa é escolher qual oportunidade preparar.
  const escolhiveis = fila.filter(disponivel);
  if (jornada.status === 'decisao' && !(jornada.perguntas ?? []).length && escolhiveis.length) {
    return { estado: 'escolher-vaga', motivo: jornada.mensagem ?? 'A busca terminou; a próxima candidatura depende da sua escolha.', quantidade: escolhiveis.length };
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

// Status reais da fila (domínio queue-status): aguardando ou em andamento.
export function disponivel(item) {
  return ['na fila', 'em andamento'].includes(item.status);
}

function buscaJaOcorreu(estado) {
  const descoberta = estado?.discovery ?? {};
  return Boolean(descoberta.collectedAt) || (descoberta.opportunities ?? []).length > 0 || (descoberta.failures ?? []).length > 0;
}
