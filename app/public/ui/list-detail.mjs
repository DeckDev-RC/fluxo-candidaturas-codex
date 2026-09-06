// Lista + detalhe contextual: a seleção, os filtros e a rolagem sobrevivem à
// ida e volta; em janela estreita o detalhe ocupa a página (U2-04).
// Lista simples de botões: cada item é alcançável por Tab e anuncia se está aberto.

import { el, button } from '../core/dom.mjs';

const selecionados = new Map();

export function selectId(area, id) { selecionados.set(area, String(id ?? '')); }

// `groupBy(item)` opcional devolve { key, label }: itens consecutivos com a mesma
// chave ficam sob um cabeçalho de grupo (ex.: a busca que trouxe as vagas).
export function listDetail({ area, items, renderItem, renderDetail, emptyState, onSelect, groupBy }) {
  const atual = selecionados.get(area) ?? '';
  const chave = (item) => String(item.id ?? item.key ?? '');
  const escolhido = items.find((item) => chave(item) === atual) ?? null;
  const aberto = Boolean(escolhido);

  let grupoAnterior = null;
  const lista = el('ul', { class: 'lista', 'aria-label': `Itens de ${area}` }, items.flatMap((item) => {
    const nos = [];
    const grupo = groupBy?.(item);
    if (grupo && grupo.key !== grupoAnterior) {
      grupoAnterior = grupo.key;
      nos.push(el('li', { class: 'lista-grupo', role: 'presentation' }, [el('h3', { class: 'lista-grupo-titulo', text: grupo.label })]));
    }
    nos.push(itemDaLista(item));
    return nos;
  }));

  function itemDaLista(item) { return el('li', {}, [
    el('button', {
      type: 'button',
      class: 'item-lista',
      'aria-expanded': String(chave(escolhido ?? {}) === chave(item)),
      dataset: { id: chave(item) },
      onClick: () => {
        selectId(area, chave(item));
        onSelect?.(item);
        // Depois da repintura, o foco vai para o detalhe recém-aberto.
        requestAnimationFrame(() => document.querySelector('.detalhe button, .detalhe h2')?.focus());
      }
    }, renderItem(item))
  ]); }

  return el('div', { class: 'lista-detalhe', dataset: { detalhe: aberto ? 'aberto' : 'fechado' } }, [
    items.length ? lista : emptyState,
    aberto && el('div', { class: 'detalhe' }, [
      el('div', { class: 'linha-acoes' }, [
        button('Voltar para a lista', {
          variant: 'texto',
          onClick: () => {
            const id = chave(escolhido);
            selectId(area, '');
            onSelect?.(null);
            requestAnimationFrame(() => document.querySelector(`.item-lista[data-id="${id}"]`)?.focus());
          }
        })
      ]),
      renderDetail(escolhido)
    ])
  ]);
}
