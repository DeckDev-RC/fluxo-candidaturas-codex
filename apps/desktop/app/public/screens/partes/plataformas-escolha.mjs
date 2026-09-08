// Escolha compacta de plataformas e metas para o primeiro uso. A meta conta
// só candidaturas confirmadas; o valor vai para a campanha ao começar.

import { el } from '../../core/dom.mjs';
import { store } from '../../core/store.mjs';

export function platformChooser() {
  const campanha = store.estado?.campaign?.platforms ?? [];
  const registro = store.plataformas ?? [];
  const campos = new Map();

  const lista = el('div', { class: 'escolhas plataformas-escolha', id: 'plataformas-escolha' }, registro.map((plataforma) => {
    const atual = campanha.find((item) => item.name === plataforma.name) ?? { enabled: false, goal: 0 };
    const habilitada = el('input', { type: 'checkbox', checked: atual.enabled === true, id: `escolha-${plataforma.name}` });
    const meta = el('input', { type: 'number', min: '1', step: '1', value: String(atual.goal || 10), id: `escolha-meta-${plataforma.name}`, 'aria-label': `Meta em ${plataforma.name}` });
    campos.set(plataforma.name, { habilitada, meta });
    return el('div', { class: 'plataforma-linha' }, [
      el('label', { class: 'escolha' }, [habilitada, el('span', { text: plataforma.name })]),
      el('label', { class: 'escolha plataforma-meta' }, [el('span', { class: 'apoio', 'aria-hidden': 'true', text: 'meta' }), meta])
    ]);
  }));

  return {
    node: registro.length ? lista : el('p', { class: 'apoio', text: 'Nenhuma plataforma disponível nesta instalação.' }),
    // Lista completa (habilitada ou não) no formato da campanha.
    valor: () => [...campos].map(([nome, { habilitada, meta }]) => ({ name: nome, enabled: habilitada.checked, goal: Number(meta.value) || 0 })),
    habilitadas: () => [...campos.values()].filter(({ habilitada }) => habilitada.checked).length
  };
}
