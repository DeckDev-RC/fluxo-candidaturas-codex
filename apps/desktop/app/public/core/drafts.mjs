// Rascunhos da interface. Uma novidade que chega no meio da digitação não pode
// apagar o que a pessoa escreveu (U9-05). Sobrevive também a recarregar a tela.

const memoria = new Map();
const PREFIXO = 'fluxo-rascunho:';

export function getDraft(chave, padrao = '') {
  if (memoria.has(chave)) return memoria.get(chave);
  try {
    const salvo = window.localStorage.getItem(PREFIXO + chave);
    if (salvo !== null) { memoria.set(chave, salvo); return salvo; }
  } catch {}
  return padrao;
}

export function setDraft(chave, valor) {
  const texto = String(valor ?? '');
  memoria.set(chave, texto);
  try { window.localStorage.setItem(PREFIXO + chave, texto); } catch {}
  return texto;
}

export function clearDraft(chave) {
  memoria.delete(chave);
  try { window.localStorage.removeItem(PREFIXO + chave); } catch {}
}

// Campo que guarda o próprio rascunho enquanto a pessoa escreve.
export function draftBound(node, chave) {
  node.value = getDraft(chave, node.value ?? '');
  node.addEventListener('input', (evento) => setDraft(chave, evento.target.value));
  return node;
}
