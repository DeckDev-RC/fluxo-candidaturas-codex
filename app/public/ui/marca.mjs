// Símbolo do Fluxo: quadrado de tinta com o traço que sobe e desce.
// Desenhado inline para funcionar sob a CSP local (sem data: URLs).

import { svg } from '../core/dom.mjs';

export function marcaFluxo({ tamanho = 22, classe = '' } = {}) {
  return svg('svg', { width: tamanho, height: tamanho, viewBox: '0 0 22 22', class: classe, 'aria-hidden': 'true', focusable: 'false' }, [
    svg('rect', { width: 22, height: 22, rx: 6, fill: 'currentColor' }),
    svg('path', { d: 'M5 13.5C8 13.5 8 8 11 8s3 5.5 6 5.5', fill: 'none', stroke: 'var(--texto-inverso)', 'stroke-width': 2, 'stroke-linecap': 'round' })
  ]);
}
