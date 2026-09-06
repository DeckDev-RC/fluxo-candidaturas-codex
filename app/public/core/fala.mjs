// Fala do Fluxo com estrutura: o modelo escreve num subconjunto pequeno de
// marcação e a interface desenha componentes (seções, cartões, pares rótulo
// e valor, fichas, listas, notas). Nada é HTML: cada linha é interpretada e
// montada com nós de texto, então conteúdo vindo do modelo ou de uma página
// nunca vira código na tela.
//
//   ## Título            → seção
//   ### Título           → cartão (cartões seguidos ficam lado a lado)
//   Rótulo: valor        → par rótulo/valor (linhas seguidas viram uma ficha)
//   Stack: a, b, c       → rótulos de lista (Stack, Tecnologias, Habilidades…) viram fichas
//   Aderência: alta      → valor com selo (alta/média/baixa, sim/não, pendente…)
//   - item / 1. item     → lista (com ou sem número)
//   > Atenção: texto     → nota (Atenção/Dica/Nota/Pronto mudam o tom)
//   **negrito**          → destaque em linha
//   linha em branco      → novo parágrafo

import { el } from './dom.mjs';

const TONS_DE_NOTA = { atenção: 'atencao', atencao: 'atencao', importante: 'atencao', dica: 'informacao', nota: 'informacao', pronto: 'sucesso', feito: 'sucesso' };
const ROTULOS_DE_FICHAS = /^(stack|tecnologias|habilidades|compet[eê]ncias|ferramentas|tags|plataformas|linguagens|requisitos|pontos fortes|lacunas)$/i;
const SELOS = { alta: 'sucesso', forte: 'sucesso', sim: 'sucesso', conectado: 'sucesso', pronto: 'sucesso', ok: 'sucesso', 'média': 'informacao', media: 'informacao', 'possível': 'informacao', parcial: 'informacao', pendente: 'atencao', baixa: 'atencao', fraca: 'atencao', 'não': 'atencao', nao: 'atencao', 'não medida': '', bloqueada: 'erro', erro: 'erro' };
const PAR = /^([A-Za-zÀ-ú][A-Za-zÀ-ú0-9 \-/()]{0,30}):\s+(.{1,240})$/;

export function renderizarFala(texto) {
  const blocos = montarBlocos(String(texto ?? '').replace(/\r\n/g, '\n').split('\n'));
  return agruparCartoes(blocos);
}

// Verdadeiro quando o texto tem alguma marca de estrutura; texto simples segue no <p> único.
export function temEstrutura(texto) {
  const t = String(texto ?? '');
  // Texto com quebra de linha também passa por aqui: parágrafos separados em vez
  // de um bloco único (a quebra de linha sumia num <p> comum).
  return /\n/.test(t.trim()) || /(^|\n)\s*(#{2,3}\s|[-*•]\s|\d+[.)]\s|>\s)|\*\*.+?\*\*/.test(t) || t.split('\n').filter((linha) => PAR.test(linha.trim())).length >= 2;
}

function montarBlocos(linhas) {
  const blocos = [];
  let paragrafo = [];
  let lista = null;
  let ficha = null;
  const fecharParagrafo = () => { if (paragrafo.length) { blocos.push({ tipo: 'p', no: el('p', { class: 'quebra' }, inline(paragrafo.join(' '))) }); paragrafo = []; } };
  const fecharLista = () => { if (lista) { blocos.push({ tipo: 'lista', no: lista.no }); lista = null; } };
  const fecharFicha = () => { if (ficha) { blocos.push({ tipo: 'ficha', no: ficha }); ficha = null; } };
  const fecharTudo = () => { fecharParagrafo(); fecharLista(); fecharFicha(); };

  for (const bruta of linhas) {
    const linha = bruta.trim();
    // Linha em branco fecha o que estava aberto e marca o fim de um cartão.
    if (!linha) { fecharTudo(); blocos.push({ tipo: 'quebra' }); continue; }
    const cartao = linha.match(/^###\s+(.+?)\s*$/);
    if (cartao) { fecharTudo(); blocos.push({ tipo: 'cartao', titulo: cartao[1] }); continue; }
    const titulo = linha.match(/^#{1,2}\s+(.+?)\s*$/);
    if (titulo) { fecharTudo(); blocos.push({ tipo: 'titulo', no: el('h4', { class: 'fala-titulo' }, inline(titulo[1])) }); continue; }
    const item = linha.match(/^(?:[-*•]|(\d+)[.)])\s+(.+)$/);
    if (item) {
      fecharParagrafo(); fecharFicha();
      const numerada = Boolean(item[1]);
      if (!lista || lista.numerada !== numerada) { fecharLista(); lista = { numerada, no: el(numerada ? 'ol' : 'ul', { class: numerada ? 'fala-lista fala-lista-numerada' : 'fala-lista marcadores' }) }; }
      lista.no.append(el('li', { class: 'quebra' }, inline(item[2])));
      continue;
    }
    const nota = linha.match(/^>\s*(.+)$/);
    if (nota) {
      fecharTudo();
      const prefixo = nota[1].match(/^([A-Za-zÀ-ú]+):\s*/);
      const tom = TONS_DE_NOTA[prefixo?.[1]?.toLocaleLowerCase()] ?? 'informacao';
      blocos.push({ tipo: 'nota', no: el('aside', { class: 'fala-nota', dataset: { tom } }, inline(nota[1])) });
      continue;
    }
    const par = linha.match(PAR);
    if (par && !/^https?$/i.test(par[1])) {
      fecharParagrafo(); fecharLista();
      if (!ficha) ficha = el('dl', { class: 'fala-ficha' });
      ficha.append(el('dt', { text: par[1] }), el('dd', {}, valorDoPar(par[1], par[2])));
      continue;
    }
    fecharLista(); fecharFicha();
    paragrafo.push(linha);
  }
  fecharTudo();
  return blocos;
}

// "### Nome" abre um cartão que recebe os blocos seguintes até a primeira linha em
// branco (ou próxima seção/cartão); cartões seguidos ficam numa grade, lado a lado.
// Depois da linha em branco, um cartão novo entra na mesma grade; qualquer outro
// bloco (nota, parágrafo, seção) fecha a grade e segue fora dos cartões.
function agruparCartoes(blocos) {
  const saida = [];
  let grade = null;
  let cartao = null;
  for (const bloco of blocos) {
    if (bloco.tipo === 'quebra') { cartao = null; continue; }
    if (bloco.tipo === 'cartao') {
      cartao = el('article', { class: 'fala-cartao' }, [el('h5', { class: 'fala-cartao-titulo' }, inline(bloco.titulo))]);
      if (!grade) { grade = el('div', { class: 'fala-cartoes' }); saida.push(grade); }
      grade.append(cartao);
      continue;
    }
    if (cartao && bloco.tipo !== 'titulo') { cartao.append(bloco.no); continue; }
    grade = null;
    cartao = null;
    saida.push(bloco.no);
  }
  for (const g of saida.filter((no) => no.classList?.contains('fala-cartoes'))) g.dataset.quantidade = String(Math.min(g.children.length, 3));
  return saida;
}

// Valor de um par: fichas para listas conhecidas, selo para níveis, texto para o resto.
function valorDoPar(rotulo, valor) {
  const limpo = valor.trim();
  if (ROTULOS_DE_FICHAS.test(rotulo.trim()) && /[,·;]/.test(limpo)) {
    return [el('span', { class: 'fala-fichas' }, limpo.split(/[,·;]/).map((f) => f.trim()).filter(Boolean).slice(0, 12).map((f) => el('span', { class: 'fala-ficha-item', text: f })))];
  }
  const chave = limpo.replace(/\*\*/g, '').toLocaleLowerCase().replace(/[.!]$/, '');
  if (chave in SELOS) return [el('span', { class: 'selo fala-selo', dataset: { tom: SELOS[chave] }, text: limpo.replace(/\*\*/g, '') })];
  const nivel = chave.match(/^(alta|forte|média|media|baixa|fraca|possível)\b/);
  if (nivel) return [el('span', { class: 'selo fala-selo', dataset: { tom: SELOS[nivel[1]] ?? '' }, text: nivel[1] }), document.createTextNode(` ${limpo.slice(nivel[1].length).trim()}`)];
  return inline(limpo);
}

// **negrito** vira <strong>; o resto é texto puro.
function inline(texto) {
  const partes = String(texto).split(/\*\*(.+?)\*\*/g);
  return partes.map((parte, indice) => (indice % 2 ? el('strong', { text: parte }) : document.createTextNode(parte))).filter((no) => no.textContent !== '');
}
