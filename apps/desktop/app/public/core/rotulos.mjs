// Dicionário único de rótulos em pt-BR: situações de candidatura e de fila,
// e concordância de número. A interface nunca mostra o valor interno cru.

// [rótulo, tom do selo]
const CANDIDATURA = {
  rascunho: ['rascunho', ''],
  'pronta para revisão': ['pronta para revisão', 'acao'],
  enviada: ['enviada', 'sucesso'],
  triagem: ['em triagem', 'informacao'],
  'teste pendente': ['teste pendente', 'atencao'],
  'teste concluído': ['teste concluído', 'sucesso'],
  entrevista: ['entrevista marcada', 'sucesso'],
  proposta: ['proposta recebida', 'sucesso'],
  rejeitada: ['encerrada pela empresa', 'erro'],
  desistência: ['você desistiu', ''],
  encerrada: ['encerrada', '']
};

const FILA = {
  'na fila': ['aguardando na fila', ''],
  'em andamento': ['em preparo', 'informacao'],
  processada: ['candidatura preparada', 'sucesso'],
  bloqueada: ['bloqueada por uma falha', 'erro'],
  descartada: ['descartada por você', '']
};

export function situacaoCandidatura(status) {
  return CANDIDATURA[status] ?? [status || 'sem situação', ''];
}

export function situacaoFila(status) {
  return FILA[status] ?? [status || 'sem situação', ''];
}

// plural(3, 'vaga') → "3 vagas"; plural(1, 'decisão', 'decisões') → "1 decisão".
export function plural(quantidade, singular, pluralForma = `${singular}s`) {
  const n = Number(quantidade) || 0;
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : pluralForma}`;
}

// Concordância de adjetivo/particípio: concorda(2, 'habilitada') → "habilitadas".
export function concorda(quantidade, singular, pluralForma = `${singular}s`) {
  return Number(quantidade) === 1 ? singular : pluralForma;
}
