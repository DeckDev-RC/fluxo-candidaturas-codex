// Acompanhamento: coluna somente de leitura ao lado da conversa. Mostra o
// andamento, o progresso real das metas por plataforma, o percurso da jornada,
// prazos e fila. Nenhum número é estimado e seção vazia não ocupa lugar.

import { badge, button, el } from '../../core/dom.mjs';
import { dataLonga, numero } from '../../core/format.mjs';
import { store } from '../../core/store.mjs';
import { go } from '../../core/router.mjs';
import { disponivel } from '../agora-estados.mjs';
import { nivelAderencia } from '../../core/aderencia.mjs';
import { nomePlataforma } from '../../core/conversa-ia.mjs';
import { exportarEvidencias, journeySteps } from './percurso.mjs';

const ENCERRADAS = new Set(['rejeitada', 'encerrada', 'desistência']);
// Mesmo critério do serviço para 'confirmada': sem rascunho, revisão pendente ou desistência.
const NAO_CONFIRMADAS = new Set(['rascunho', 'pronta para revisão', 'desistência']);
const PLANO_PADRAO = [
  { id: 'intake', label: 'Entender seu perfil' },
  { id: 'discovery', label: 'Encontrar oportunidades' },
  { id: 'fit', label: 'Comparar aderência' },
  { id: 'application', label: 'Preparar candidaturas' },
  { id: 'followup', label: 'Acompanhar processos' }
].map((etapa) => ({ ...etapa, status: 'pending' }));

export function trackingPanel(situacao) {
  const dados = store.estado ?? {};
  const jornada = store.jornada ?? {};
  const titulo = el('h2', { class: 'apenas-leitor', text: 'Acompanhamento' });

  if (situacao.estado === 'primeiro-uso') {
    return el('aside', { class: 'acompanhamento', 'aria-labelledby': 'acompanhamento-titulo' }, [
      Object.assign(titulo, { id: 'acompanhamento-titulo' }),
      secao('O que vai acontecer', [
        journeySteps({ plano: PLANO_PADRAO }),
        el('p', { class: 'apoio', text: 'Cada etapa aparece aqui conforme avança. Você decide antes de qualquer envio.' })
      ])
    ]);
  }

  return el('aside', { class: 'acompanhamento', 'aria-labelledby': 'acompanhamento-titulo' }, [
    Object.assign(titulo, { id: 'acompanhamento-titulo' }),
    andamento(situacao, jornada),
    navegador(store.conversa),
    metas(dados),
    jornada.plano?.length ? secao('Percurso', journeySteps(jornada), button('Exportar evidências', { variant: 'texto', 'aria-label': 'Exportar evidências desta jornada', onClick: exportarEvidencias })) : null,
    prazos(dados),
    fila(dados)
  ]);
}

// Só o que a fala atual não diz: a saúde da conexão com a execução.
function andamento(_situacao, jornada) {
  const itens = [
    jornada.conexao === 'reconectando'
      ? el('p', { class: 'apoio', text: `Conexão com a execução caiu. Tentando de novo em ${Math.round((jornada.esperaMs ?? 1000) / 1000)}s.` })
      : null
  ].filter(Boolean);
  return itens.length ? secao('Andamento', itens) : null;
}

// Abas que a IA abriu, uma por plataforma, e o que cada uma espera de você.
function navegador(conversa) {
  const abas = conversa?.abas ?? [];
  if (!abas.length) return null;
  return secao('Navegador', el('ul', { class: 'acompanhamento-lista' }, abas.map((aba) => linha(
    nomePlataforma(aba.platform),
    aba.title || aba.url || '',
    aba.challenge ? badge('verificação pendente', 'atencao') : aba.loginPending ? badge('login pendente', 'atencao') : badge('conectado', 'sucesso')
  ))));
}

function metas(dados) {
  const plataformas = (dados.campaign?.platforms ?? []).filter((item) => item.enabled !== false);
  if (!plataformas.length) return null;
  const candidaturas = (dados.applications?.items ?? []).filter((item) => !NAO_CONFIRMADAS.has(item.status));
  const total = Number(dados.applications?.confirmedCount ?? 0);
  const metaTotal = Number(dados.campaign?.totalGoal ?? 0);
  return secao('Metas', [
    barraDeMeta('Total confirmado', total, metaTotal, true),
    ...plataformas.map((plataforma) => barraDeMeta(
      plataforma.name,
      candidaturas.filter((item) => (item.platform ?? '').toLocaleLowerCase() === plataforma.name.toLocaleLowerCase()).length,
      Number(plataforma.goal ?? 0)
    ))
  ], acaoSecao('Ajustar', 'configuracoes', 'Ajustar plataformas e metas'));
}

// Barra baseada em confirmações reais. Sem meta, mostra só a contagem.
function barraDeMeta(rotulo, feito, meta, destaque = false) {
  const proporcao = meta > 0 ? Math.min(feito / meta, 1) : 0;
  return el('div', { class: 'meta', dataset: { destaque: String(destaque), completa: String(meta > 0 && feito >= meta) } }, [
    el('div', { class: 'meta-linha' }, [
      el('span', { class: 'meta-rotulo quebra', text: rotulo }),
      el('span', { class: 'meta-valor numero', text: meta > 0 ? `${numero(feito)} de ${numero(meta)}` : numero(feito) })
    ]),
    meta > 0
      ? el('div', { class: 'meta-barra', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': meta, 'aria-valuenow': feito, 'aria-label': `${rotulo}: ${feito} de ${meta}` }, [
        el('span', { style: `width:${Math.round(proporcao * 100)}%` })
      ])
      : null
  ]);
}

function prazos(dados) {
  const compromissos = (dados.applications?.items ?? [])
    .filter((item) => !ENCERRADAS.has(item.status) && (item.nextAction || item.deadline))
    .slice(0, 4)
    .map((item) => linha(`${item.role ?? 'Vaga'} — ${item.company ?? 'empresa não informada'}`, item.nextAction ?? 'Revisar o processo', item.deadline ? badge(`prazo ${dataLonga(item.deadline)}`, 'atencao') : null));
  const pendentes = (store.pendencias ?? []).slice(0, 3)
    .map((item) => linha(item.nextAction ?? 'Pendência', item.reference ?? '', item.urgency ? badge(item.urgency, 'atencao') : null));
  const itens = [...compromissos, ...pendentes];
  if (!itens.length) return null;
  return secao('Prazos e próximos passos', el('ul', { class: 'acompanhamento-lista' }, itens), acaoSecao('Candidaturas', 'candidaturas', 'Abrir todas as candidaturas'));
}

function fila(dados) {
  const itens = (dados.queue?.items ?? []).filter(disponivel);
  if (!itens.length) return null;
  const principais = itens.slice().sort((a, b) => String(a.priority ?? 'Z').localeCompare(String(b.priority ?? 'Z'))).slice(0, 3);
  return secao(`Fila · ${numero(itens.length)}`, el('ul', { class: 'acompanhamento-lista' }, principais.map((item) => linha(
    item.role ?? 'Vaga',
    `${item.company ?? 'empresa não informada'} · ${item.platform ?? 'origem não informada'}`,
    badge(nivelAderencia(item).rotulo, nivelAderencia(item).tom)
  ))), acaoSecao('Oportunidades', 'oportunidades', 'Abrir todas as oportunidades'));
}

function linha(titulo, apoio, selo) {
  return el('li', { class: 'acompanhamento-item' }, [
    el('div', {}, [
      el('p', { class: 'item-titulo quebra', text: titulo }),
      apoio && el('p', { class: 'apoio quebra', text: apoio })
    ]),
    selo
  ]);
}

function secao(titulo, conteudo, acao) {
  return el('section', { class: 'acompanhamento-secao' }, [
    el('header', { class: 'acompanhamento-cabecalho' }, [el('h3', { text: titulo }), acao]),
    conteudo
  ]);
}

function acaoSecao(rotulo, rota, descricao = rotulo) {
  return button(rotulo, { variant: 'texto', 'aria-label': descricao, onClick: () => go(rota) });
}
