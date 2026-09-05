// Linha do tempo da conversa. A fala atual do Fluxo (situação + cartão com
// formulário, decisões ou vagas) abre a coluna; o histórico vem abaixo, em
// ordem, e a mensagem mais nova fica junto da caixa de escrever. Quando a fala
// atual sai da vista, uma barra fixa com o título e as ações a representa.
// A fala atual é recalculada do estado persistido a cada pintura.

import { badge, el, staticListItem } from '../../core/dom.mjs';
import { hora } from '../../core/format.mjs';
import { nivelAderencia } from '../../core/aderencia.mjs';
import { store } from '../../core/store.mjs';
import { isThinking, takeScrollRequest, transcript } from '../../core/conversa.mjs';
import { disponivel, TEXTOS } from '../agora-estados.mjs';
import { firstRunPanel } from '../primeiro-uso.mjs';
import { decisionList } from '../decisoes.mjs';
import { marcaFluxo } from '../../ui/marca.mjs';
import { acoesDaSituacao } from './situacao-acoes.mjs';
import { botaoPreparar } from './preparar-candidatura.mjs';

// Nestas situações o motivo repete o corpo ou já aparece na ação "ocupado".
const SEM_MOTIVO = new Set(['primeiro-uso', 'pronta-para-buscar', 'trabalhando', 'decisao-pendente', 'escolher-vaga']);
let focoInicialDado = false;
let observador = null;

export function conversationColumn(situacao, pendentes) {
  const atual = bolhaAtual(situacao, pendentes);
  const barra = barraFixa(situacao, pendentes);
  const coluna = el('section', { class: 'conversa-coluna', 'aria-label': 'Conversa com o Fluxo' }, [
    barra,
    el('ol', { class: 'linha-do-tempo', id: 'linha-do-tempo' }, [
      atual,
      transcript().map(balao),
      isThinking() ? el('li', { class: 'balao', dataset: { autor: 'fluxo' }, 'aria-live': 'polite' }, [avatar(), el('div', { class: 'balao-corpo' }, [el('span', { class: 'ocupado', text: 'Pensando…' })])]) : null
    ])
  ]);
  if (takeScrollRequest()) requestAnimationFrame(rolarParaOFim);
  if (situacao.estado === 'primeiro-uso' && !focoInicialDado) {
    focoInicialDado = true;
    requestAnimationFrame(focarObjetivo);
  }
  requestAnimationFrame(() => observarFalaAtual(atual, barra));
  return coluna;
}

// A barra só aparece quando a fala atual saiu da área visível.
function observarFalaAtual(atual, barra) {
  observador?.disconnect();
  const raiz = document.querySelector('#conteudo');
  if (!raiz || !atual.isConnected) return;
  observador = new IntersectionObserver(([entrada]) => { barra.dataset.visivel = entrada.isIntersecting ? 'false' : 'true'; }, { root: raiz, threshold: 0.05 });
  observador.observe(atual);
}

function barraFixa(situacao, pendentes) {
  const texto = TEXTOS[situacao.estado] ?? { titulo: situacao.estado };
  return el('div', { class: 'situacao-fixa', dataset: { visivel: 'false' } }, [
    avatar(),
    el('p', { class: 'situacao-fixa-titulo quebra', text: texto.titulo }),
    el('div', { class: 'linha-acoes' }, [
      ...acoesDaSituacao(situacao, pendentes).filter((no) => no.tagName === 'BUTTON'),
      el('button', { type: 'button', class: 'botao botao-texto', text: 'Ver detalhes', onClick: () => document.querySelector('#painel-agora')?.scrollIntoView({ block: 'start', behavior: 'smooth' }) })
    ])
  ]);
}

// Falas seguidas do mesmo autor formam um grupo: avatar e horário só na
// primeira, para a leitura seguir o fio sem repetição.
const MESMO_GRUPO_MS = 3 * 60 * 1000;

function balao(mensagem, indice, lista) {
  const anterior = lista[indice - 1];
  const continuacao = Boolean(anterior && anterior.autor === mensagem.autor && Date.parse(mensagem.em) - Date.parse(anterior.em) < MESMO_GRUPO_MS);
  const dataset = { autor: mensagem.autor, ...(mensagem.tom ? { tom: mensagem.tom } : {}), ...(continuacao ? { continuacao: 'true' } : {}) };
  return el('li', { class: 'balao', dataset }, [
    mensagem.autor === 'fluxo' ? avatar() : null,
    el('div', { class: 'balao-corpo' }, [
      continuacao ? null : el('time', { class: 'balao-hora', datetime: mensagem.em, text: hora(mensagem.em) }),
      el('p', { class: 'quebra', text: mensagem.texto })
    ])
  ]);
}

function bolhaAtual(situacao, pendentes) {
  const texto = TEXTOS[situacao.estado] ?? { titulo: situacao.estado, corpo: '' };
  return el('li', { class: 'balao balao-atual', id: 'painel-agora', dataset: { autor: 'fluxo', estadoAgora: situacao.estado } }, [
    avatar(),
    el('div', { class: 'balao-corpo' }, [
      el('h1', { text: texto.titulo }),
      texto.corpo && el('p', { class: 'leitura secundario', text: texto.corpo }),
      !SEM_MOTIVO.has(situacao.estado) && situacao.motivo ? el('p', { class: 'apoio', text: situacao.motivo }) : null,
      cartao(situacao, pendentes),
      el('div', { class: 'linha-acoes', id: 'acoes-agora' }, acoesDaSituacao(situacao, pendentes))
    ])
  ]);
}

// Cartões inline: o que precisa de entrada estruturada continua estruturado.
function cartao(situacao, pendentes) {
  return [
    situacao.estado === 'primeiro-uso' ? el('div', { class: 'balao-cartao' }, [firstRunPanel()]) : null,
    pendentes.length ? el('div', { class: 'balao-cartao' }, [decisionList(pendentes.slice(0, 3))]) : null,
    situacao.estado === 'escolher-vaga' ? el('div', { class: 'balao-cartao' }, [vagasParaEscolher()]) : null
  ];
}

// As melhores oportunidades da fila, prontas para preparar; o resto fica na área própria.
function vagasParaEscolher() {
  const itens = (store.estado?.queue?.items ?? []).filter(disponivel)
    .sort((a, b) => Number(b.fitScore ?? 0) - Number(a.fitScore ?? 0))
    .slice(0, 3);
  return el('ul', { class: 'lista', id: 'vagas-para-escolher' }, itens.map((item) => staticListItem({
    title: item.role ?? 'Cargo não informado',
    support: `${item.company ?? 'Empresa não informada'} · ${item.platform ?? 'origem não informada'}`,
    right: [
      badge(nivelAderencia(item).rotulo, nivelAderencia(item).tom),
      botaoPreparar(item)
    ]
  })));
}

function avatar() {
  return marcaFluxo({ tamanho: 24, classe: 'balao-avatar' });
}

function rolarParaOFim() {
  const area = document.querySelector('#conteudo');
  if (area) area.scrollTop = area.scrollHeight;
}

// Só quando ninguém está digitando: o foco diz por onde começar.
function focarObjetivo() {
  const ativo = document.activeElement;
  if (ativo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ativo.tagName)) return;
  document.querySelector('#objetivo')?.focus({ preventScroll: true });
}
