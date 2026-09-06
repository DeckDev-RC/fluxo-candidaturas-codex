// Fala do Fluxo com estrutura: um subconjunto pequeno de marcação vira blocos
// legíveis (título de seção, lista, destaque, nota). Nada é HTML: cada linha é
// interpretada e montada com nós de texto, então conteúdo vindo do modelo ou de
// uma página nunca vira código na tela.
//
//   ## Título          → cabeçalho de seção
//   - item / 1. item   → lista (com ou sem número)
//   > Atenção: texto   → nota (Atenção/Dica/Nota/Importante mudam o tom)
//   **negrito**        → destaque em linha
//   linha em branco    → novo parágrafo

import { el } from './dom.mjs';

const TONS_DE_NOTA = { atenção: 'atencao', atencao: 'atencao', importante: 'atencao', dica: 'informacao', nota: 'informacao', pronto: 'sucesso', feito: 'sucesso' };

export function renderizarFala(texto) {
  const linhas = String(texto ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocos = [];
  let paragrafo = [];
  let lista = null;
  const fecharParagrafo = () => { if (paragrafo.length) { blocos.push(el('p', { class: 'quebra' }, inline(paragrafo.join(' ')))); paragrafo = []; } };
  const fecharLista = () => { if (lista) { blocos.push(lista.no); lista = null; } };

  for (const bruta of linhas) {
    const linha = bruta.trim();
    if (!linha) { fecharParagrafo(); fecharLista(); continue; }
    const titulo = linha.match(/^#{1,3}\s+(.+)$/);
    if (titulo) { fecharParagrafo(); fecharLista(); blocos.push(el('h4', { class: 'fala-titulo' }, inline(titulo[1]))); continue; }
    const item = linha.match(/^(?:[-*•]|(\d+)[.)])\s+(.+)$/);
    if (item) {
      fecharParagrafo();
      const numerada = Boolean(item[1]);
      if (!lista || lista.numerada !== numerada) { fecharLista(); lista = { numerada, no: el(numerada ? 'ol' : 'ul', { class: numerada ? 'fala-lista fala-lista-numerada' : 'fala-lista marcadores' }) }; }
      lista.no.append(el('li', { class: 'quebra' }, inline(item[2])));
      continue;
    }
    const nota = linha.match(/^>\s*(.+)$/);
    if (nota) {
      fecharParagrafo(); fecharLista();
      const prefixo = nota[1].match(/^([A-Za-zÀ-ú]+):\s*/);
      const tom = TONS_DE_NOTA[prefixo?.[1]?.toLocaleLowerCase()] ?? 'informacao';
      blocos.push(el('aside', { class: 'fala-nota', dataset: { tom } }, inline(nota[1])));
      continue;
    }
    fecharLista();
    paragrafo.push(linha);
  }
  fecharParagrafo(); fecharLista();
  return blocos;
}

// **negrito** vira <strong>; o resto é texto puro.
function inline(texto) {
  const partes = String(texto).split(/\*\*(.+?)\*\*/g);
  return partes.map((parte, indice) => (indice % 2 ? el('strong', { text: parte }) : document.createTextNode(parte))).filter((no) => no.textContent !== '');
}

// Verdadeiro quando o texto tem alguma marca de estrutura; texto simples segue no <p> único.
export function temEstrutura(texto) {
  return /(^|\n)\s*(#{1,3}\s|[-*•]\s|\d+[.)]\s|>\s)|\*\*.+?\*\*/.test(String(texto ?? ''));
}
