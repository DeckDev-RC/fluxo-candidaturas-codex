// Lista + detalhe contextual: a seleção, os filtros e a rolagem sobrevivem à
// ida e volta; em janela estreita o detalhe ocupa a página (U2-04).

import { el, button } from '../core/dom.mjs';

const selecionados = new Map();

export function selectedId(area) { return selecionados.get(area) ?? ''; }
export function selectId(area, id) { selecionados.set(area, String(id ?? '')); }

export function listDetail({ area, items, renderItem, renderDetail, emptyState, onSelect }) {
  const atual = selectedId(area);
  const escolhido = items.find((item) => String(item.id) === atual) ?? null;
  const aberto = Boolean(escolhido);

  const lista = el('ul', { class: 'lista', role: 'listbox', 'aria-label': `Itens de ${area}` }, items.map((item) => el('li', { role: 'none' }, [
    el('button', {
      type: 'button',
      class: 'item-lista',
      role: 'option',
      'aria-selected': String(escolhido?.id === item.id),
      dataset: { id: String(item.id) },
      onClick: () => { selectId(area, item.id); onSelect?.(item); }
    }, renderItem(item))
  ])));

  return el('div', { class: 'lista-detalhe', dataset: { detalhe: aberto ? 'aberto' : 'fechado' } }, [
    items.length ? lista : emptyState,
    aberto && el('div', { class: 'detalhe' }, [
      el('div', { class: 'linha-acoes' }, [
        button('Voltar para a lista', { variant: 'texto', onClick: () => { selectId(area, ''); onSelect?.(null); } })
      ]),
      renderDetail(escolhido)
    ])
  ]);
}
