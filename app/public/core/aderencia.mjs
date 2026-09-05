// Leitura única da aderência de uma vaga: mesmo rótulo, tom e limiares em toda
// a interface. A aderência é justificativa a partir de dados confirmados, não
// probabilidade de contratação.

export const LIMIAR_FORTE = 80;
export const LIMIAR_POSSIVEL = 50;

export function nivelAderencia(item) {
  const nota = Number(item?.fitScore ?? 0);
  if ([item?.eliminators].flat().filter(Boolean).length) return { rotulo: 'requisito eliminatório', tom: 'erro', nota };
  if (!nota) return { rotulo: 'aderência não calculada', tom: '', nota };
  if (nota >= LIMIAR_FORTE) return { rotulo: `aderência forte · ${nota}%`, tom: 'sucesso', nota };
  if (nota >= LIMIAR_POSSIVEL) return { rotulo: `aderência possível · ${nota}%`, tom: 'informacao', nota };
  return { rotulo: `aderência fraca · ${nota}%`, tom: '', nota };
}
