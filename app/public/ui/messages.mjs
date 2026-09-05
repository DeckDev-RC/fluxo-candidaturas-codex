// Mensagens persistentes: aprovações, falhas e prazos continuam encontráveis
// depois que a pessoa deixa de olhar a tela (U7-05). Nada desaparece sozinho.

import { el, replace } from '../core/dom.mjs';

const mensagens = [];
const AGRUPAR_MS = 4000;
const espelhos = new Set();

// Quem quiser refletir os avisos em outro lugar (a conversa, por exemplo)
// registra aqui. O aviso continua persistente na região própria.
export function onNotice(listener) {
  espelhos.add(listener);
  return () => espelhos.delete(listener);
}

// `persistente` força a faixa mesmo na conversa (ex.: identificação de demonstração).
export function notice(texto, tom = 'informacao', { acao, persistente = false } = {}) {
  for (const espelho of espelhos) espelho(texto, tom);
  const agora = Date.now();
  const anterior = mensagens.at(-1);
  if (anterior && anterior.texto === texto && agora - anterior.em < AGRUPAR_MS) {
    anterior.repeticoes += 1;
    anterior.em = agora;
  } else {
    mensagens.push({ texto, tom, acao, persistente, em: agora, repeticoes: 1 });
  }
  while (mensagens.length > 4) mensagens.shift();
  render();
}

export function renderNotices() { render(); }

// Na conversa, o andamento já está na linha do tempo: a faixa fica só para o
// que exige atenção (erro, atenção) ou foi marcado como persistente. Nas
// demais áreas, todo aviso aparece, porque lá não há linha do tempo.
function visivel(item) {
  const naConversa = document.querySelector('#conteudo')?.dataset.area === 'agora';
  return !naConversa || item.persistente || item.tom === 'erro' || item.tom === 'atencao';
}

function render() {
  const regiao = document.querySelector('#mensagens');
  if (!regiao) return;
  // Erro é anunciado de imediato (alert); o resto segue a região polida.
  replace(regiao, mensagens.filter(visivel).map((item) => el('div', { class: 'aviso', dataset: { tom: item.tom }, role: item.tom === 'erro' ? 'alert' : undefined }, [
    el('div', { class: 'leitura' }, [
      el('p', { text: item.repeticoes > 1 ? `${item.texto} (${item.repeticoes}×)` : item.texto }),
      item.acao
    ]),
    el('button', {
      type: 'button',
      class: 'botao botao-texto',
      text: 'Dispensar',
      'aria-label': `Dispensar aviso: ${item.texto}`,
      onClick: () => { mensagens.splice(mensagens.indexOf(item), 1); render(); }
    })
  ])));
}
