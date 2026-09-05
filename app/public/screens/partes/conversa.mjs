// Linha do tempo da conversa: histórico registrado e, por último, a fala atual
// do Fluxo com o cartão da situação (objetivo e currículo, decisões, ações).
// A fala atual é recalculada do estado persistido a cada pintura.

import { el } from '../../core/dom.mjs';
import { hora } from '../../core/format.mjs';
import { takeScrollRequest, transcript } from '../../core/conversa.mjs';
import { TEXTOS } from '../agora-estados.mjs';
import { firstRunPanel } from '../primeiro-uso.mjs';
import { decisionList } from '../decisoes.mjs';
import { marcaFluxo } from '../../ui/marca.mjs';
import { acoesDaSituacao } from './situacao-acoes.mjs';

// Nestas situações o motivo repete o corpo ou já aparece na ação "ocupado".
const SEM_MOTIVO = new Set(['primeiro-uso', 'pronta-para-buscar', 'trabalhando', 'decisao-pendente']);
let focoInicialDado = false;

export function conversationColumn(situacao, pendentes) {
  const coluna = el('section', { class: 'conversa-coluna', 'aria-label': 'Conversa com o Fluxo' }, [
    el('ol', { class: 'linha-do-tempo', id: 'linha-do-tempo' }, [
      transcript().map(balao),
      bolhaAtual(situacao, pendentes)
    ])
  ]);
  if (takeScrollRequest()) requestAnimationFrame(rolarParaOFim);
  if (situacao.estado === 'primeiro-uso' && !focoInicialDado) {
    focoInicialDado = true;
    requestAnimationFrame(focarObjetivo);
  }
  return coluna;
}

function balao(mensagem) {
  const dataset = mensagem.tom ? { autor: mensagem.autor, tom: mensagem.tom } : { autor: mensagem.autor };
  return el('li', { class: 'balao', dataset }, [
    mensagem.autor === 'fluxo' ? avatar() : null,
    el('div', { class: 'balao-corpo' }, [
      el('p', { class: 'quebra', text: mensagem.texto }),
      el('time', { class: 'balao-hora', datetime: mensagem.em, text: hora(mensagem.em) })
    ])
  ]);
}

function bolhaAtual(situacao, pendentes) {
  const texto = TEXTOS[situacao.estado] ?? { titulo: situacao.estado, corpo: '' };
  return el('li', { class: 'balao balao-atual', id: 'painel-agora', dataset: { autor: 'fluxo', estadoAgora: situacao.estado } }, [
    avatar(),
    el('div', { class: 'balao-corpo' }, [
      el('h2', { text: texto.titulo }),
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
    pendentes.length ? el('div', { class: 'balao-cartao' }, [decisionList(pendentes.slice(0, 3))]) : null
  ];
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
