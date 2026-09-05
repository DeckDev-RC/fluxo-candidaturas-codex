// Mensagens persistentes: aprovações, falhas e prazos continuam encontráveis
// depois que a pessoa deixa de olhar a tela (U7-05). Nada desaparece sozinho.

import { el, replace } from '../core/dom.mjs';

const mensagens = [];
const AGRUPAR_MS = 4000;

export function notice(texto, tom = 'informacao', { acao } = {}) {
  const agora = Date.now();
  const anterior = mensagens.at(-1);
  if (anterior && anterior.texto === texto && agora - anterior.em < AGRUPAR_MS) {
    anterior.repeticoes += 1;
    anterior.em = agora;
  } else {
    mensagens.push({ texto, tom, acao, em: agora, repeticoes: 1 });
  }
  while (mensagens.length > 4) mensagens.shift();
  render();
}

export function clearNotices() {
  mensagens.length = 0;
  render();
}

function render() {
  const regiao = document.querySelector('#mensagens');
  if (!regiao) return;
  replace(regiao, mensagens.map((item, indice) => el('div', { class: 'aviso', dataset: { tom: item.tom } }, [
    el('div', { class: 'leitura' }, [
      el('p', { text: item.repeticoes > 1 ? `${item.texto} (${item.repeticoes}×)` : item.texto }),
      item.acao
    ]),
    el('button', {
      type: 'button',
      class: 'botao botao-texto',
      text: 'Dispensar',
      'aria-label': `Dispensar aviso: ${item.texto}`,
      onClick: () => { mensagens.splice(indice, 1); render(); }
    })
  ])));
}
