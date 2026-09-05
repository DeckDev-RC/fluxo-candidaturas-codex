// Tela Agora: responde objetivo ativo, o que o Fluxo está fazendo, o que
// precisa de você e qual é o próximo passo das candidaturas (seções 2 e 5).

import { badge, button, el, emptyState, panel } from '../core/dom.mjs';
import { frescor, numero } from '../core/format.mjs';
import { decisions, store } from '../core/store.mjs';
import { go } from '../core/router.mjs';
import { conferirEnvio, consultarNovidades, encerrarCampanha, pausarJornada, retomarJornada } from '../core/actions.mjs';
import { notice } from '../ui/messages.mjs';
import { resolveNowState, disponivel } from './agora-estados.mjs';
import { journeyPanel } from './partes/percurso.mjs';
import { decisionList } from './decisoes.mjs';
import { firstRunPanel } from './primeiro-uso.mjs';

const TEXTOS = {
  'primeiro-uso': {
    titulo: 'Vamos começar pelo seu objetivo',
    corpo: 'Diga o que você quer alcançar e importe seu currículo. O Fluxo lê o documento, mostra o que entendeu e pergunta apenas o que faltar.'
  },
  'decisao-pendente': {
    titulo: 'Há uma decisão esperando por você',
    corpo: 'O Fluxo parou de propósito nesta etapa. Nada é enviado sem a sua aprovação.'
  },
  'envio-incerto': {
    titulo: 'Um envio ficou sem confirmação',
    corpo: 'A plataforma não sinalizou o recebimento. Confira a página antes de qualquer nova tentativa: o Fluxo não repete o clique por conta própria.'
  },
  'acesso-indisponivel': {
    titulo: 'A automação de IA está indisponível',
    corpo: 'Seus dados continuam acessíveis e você pode revisar, corrigir e decidir. A busca automática volta quando o acesso for restabelecido.'
  },
  pausada: {
    titulo: 'Jornada pausada por você',
    corpo: 'O ponto de retomada está salvo. Nenhuma nova ação externa será iniciada até você retomar.'
  },
  'material-nao-lido': {
    titulo: 'Ainda estou lendo seu currículo',
    corpo: 'O arquivo foi transferido e verificado. A leitura e a sua revisão são etapas separadas: nada é usado antes de você confirmar.'
  },
  trabalhando: {
    titulo: 'O Fluxo está trabalhando',
    corpo: 'Você pode acompanhar cada etapa e pausar quando quiser. Só será chamado quando uma decisão depender de você.'
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

export function agoraScreen() {
  const { estado: dados, perfil, ia, jornada } = store;
  const pendentes = decisions();
  const situacao = resolveNowState({ estado: dados, jornada, decisoes: pendentes, perfil, ia });
  const texto = TEXTOS[situacao.estado];

  return el('div', { class: 'area', dataset: { estadoAgora: situacao.estado }, style: 'padding:0;gap:1.5rem' }, [
    panel({
      kicker: 'agora',
      title: texto.titulo,
      id: 'painel-agora',
      children: [
        el('p', { class: 'leitura secundario', text: texto.corpo }),
        el('p', { class: 'apoio', text: situacao.motivo }),
        el('div', { class: 'linha-acoes', id: 'acoes-agora' }, acoes(situacao, pendentes))
      ]
    }),
    situacao.estado === 'primeiro-uso' ? firstRunPanel() : null,
    pendentes.length ? panel({
      kicker: 'precisa de você',
      title: `${pendentes.length} ${pendentes.length === 1 ? 'decisão' : 'decisões'}`,
      children: decisionList(pendentes.slice(0, 3))
    }) : null,
    jornada.plano?.length ? journeyPanel(jornada) : null,
    resultadosPanel(dados),
    proximasAcoesPanel(dados)
  ]);
}

function acoes(situacao, pendentes) {
  const acoes = [];
  if (situacao.estado === 'decisao-pendente') {
    acoes.push(button('Abrir decisões', { onClick: () => go('decisoes') }));
  }
  if (situacao.estado === 'envio-incerto') {
    acoes.push(button('Conferir na plataforma', {
      onClick: () => executar(() => conferirEnvio(store.jornada.runId))
    }));
  }
  if (situacao.estado === 'acesso-indisponivel') {
    acoes.push(button('Resolver acesso', { onClick: () => go('configuracoes') }));
    acoes.push(button('Continuar revisando meus dados', { variant: 'secundario', onClick: () => go('perfil') }));
  }
  if (situacao.estado === 'pausada') {
    acoes.push(button('Retomar de onde parou', { onClick: () => executar(retomarJornada) }));
    acoes.push(button('Encerrar campanha', { variant: 'secundario', onClick: () => executar(encerrarCampanha) }));
  }
  if (situacao.estado === 'trabalhando') {
    acoes.push(button('Pausar', { variant: 'secundario', onClick: () => executar(pausarJornada) }));
    acoes.push(el('span', { class: 'ocupado', text: store.jornada.mensagem || 'Executando a próxima tarefa autorizada.' }));
  }
  if (situacao.estado === 'material-nao-lido') {
    acoes.push(button('Revisar o que entendi', { onClick: () => go('perfil') }));
  }
  if (situacao.estado === 'sem-vaga-adequada') {
    acoes.push(button('Ajustar filtros', { onClick: () => go('configuracoes') }));
    acoes.push(button('Consultar novidades agora', { variant: 'secundario', onClick: () => executar(consultarNovidades) }));
  }
  if (situacao.estado === 'campanha-concluida') {
    acoes.push(button('Acompanhar processos', { onClick: () => go('candidaturas') }));
  }
  if (situacao.estado === 'preparar-ambiente') {
    acoes.push(button('Abrir preparação', { onClick: () => go('configuracoes') }));
  }
  if (situacao.estado === 'pronta-para-buscar') {
    acoes.push(button('Procurar vagas agora', { onClick: () => go('primeiro-uso') }));
    acoes.push(button('Ver oportunidades já encontradas', { variant: 'secundario', onClick: () => go('oportunidades') }));
  }
  if (!pendentes.length && ['trabalhando', 'pronta-para-buscar'].includes(situacao.estado)) {
    acoes.push(el('span', { class: 'apoio', text: 'Nenhuma decisão pendente no momento.' }));
  }
  return acoes;
}

function resultadosPanel(dados) {
  const confirmadas = dados?.applications?.items?.filter((item) => item.status !== 'rascunho') ?? [];
  const meta = Number(dados?.campaign?.totalGoal ?? 0);
  return panel({
    kicker: 'resultados confirmados',
    title: 'O que já aconteceu',
    actions: [button('Ver candidaturas', { variant: 'texto', onClick: () => go('candidaturas') })],
    children: [
      el('div', { class: 'blocos' }, [
        bloco('Candidaturas confirmadas', numero(dados?.applications?.confirmedCount ?? 0), meta ? `de ${numero(meta)} na meta` : 'sem meta definida'),
        bloco('Oportunidades na fila', numero((dados?.queue?.items ?? []).filter(disponivel).length), 'aguardando comparação ou revisão'),
        bloco('Processos em andamento', numero(confirmadas.filter((item) => !['rejeitada', 'encerrada', 'desistência'].includes(item.status)).length), 'com retorno esperado')
      ]),
      confirmadas.length
        ? el('ul', { class: 'lista' }, confirmadas.slice(-4).reverse().map((item) => el('li', {}, [
          el('div', { class: 'item-lista', role: 'none', style: 'cursor:default' }, [
            el('div', {}, [
              el('p', { class: 'item-titulo quebra', text: `${item.role ?? 'Vaga'} — ${item.company ?? 'empresa não informada'}` }),
              el('p', { class: 'item-apoio', text: frescor(item.lastCheckedAt ?? item.updatedAt ?? item.date, { prefixo: 'Verificado' }) })
            ]),
            el('div', { class: 'item-direita' }, [
              badge(item.status ?? 'sem situação', tomStatus(item.status)),
              el('span', { class: 'apoio', text: item.nextAction ?? 'sem próxima ação registrada' })
            ])
          ])
        ])))
        : emptyState(
          'Nenhuma candidatura confirmada ainda',
          'Quando uma plataforma confirmar o recebimento, a candidatura aparece aqui com a evidência guardada neste computador.'
        )
    ]
  });
}

function proximasAcoesPanel(dados) {
  const compromissos = (dados?.applications?.items ?? [])
    .filter((item) => item.nextAction || item.deadline)
    .map((item) => ({
      titulo: `${item.role ?? 'Vaga'} — ${item.company ?? 'empresa não informada'}`,
      acao: item.nextAction ?? 'Revisar o processo',
      prazo: item.deadline ?? '',
      origem: item.lastCheckedAt ? 'observado na plataforma' : 'registro manual'
    }));
  return panel({
    kicker: 'próximos passos',
    title: 'Compromissos e prazos',
    actions: [button('Consultar novidades', { variant: 'secundario', onClick: () => executar(consultarNovidades) })],
    children: compromissos.length
      ? el('ul', { class: 'lista' }, compromissos.slice(0, 6).map((item) => el('li', {}, [
        el('div', { class: 'item-lista', role: 'none', style: 'cursor:default' }, [
          el('div', {}, [
            el('p', { class: 'item-titulo quebra', text: item.titulo }),
            el('p', { class: 'item-apoio', text: item.acao })
          ]),
          el('div', { class: 'item-direita' }, [
            item.prazo ? badge(`prazo ${item.prazo}`, 'atencao') : null,
            el('span', { class: 'apoio', text: item.origem })
          ])
        ])
      ])))
      : emptyState('Nenhum compromisso registrado', 'Testes, entrevistas e prazos aparecem aqui quando forem observados na plataforma ou registrados por você.')
  });
}

function bloco(rotulo, valor, apoio) {
  return el('div', { class: 'bloco' }, [
    el('span', { class: 'etiqueta', text: rotulo }),
    el('strong', { class: 'numero', text: valor }),
    el('span', { class: 'apoio', text: apoio })
  ]);
}

function tomStatus(status) {
  if (['proposta', 'entrevista', 'teste concluído'].includes(status)) return 'sucesso';
  if (['teste pendente', 'triagem'].includes(status)) return 'atencao';
  if (['rejeitada', 'encerrada', 'desistência'].includes(status)) return 'erro';
  return 'informacao';
}

async function executar(acao) {
  try { await acao(); } catch (error) { notice(error.message, 'erro'); }
}
