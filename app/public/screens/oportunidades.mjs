// Oportunidades: lista comparável sem abrir cada vaga, com motivo da
// recomendação e dado ausente identificado (U5-01 a U5-03).

import { badge, button, definitions, el, emptyState, field, panel } from '../core/dom.mjs';
import { frescor, salario } from '../core/format.mjs';
import { store } from '../core/store.mjs';
import { prepararCandidatura } from '../core/actions.mjs';
import { listDetail } from '../ui/list-detail.mjs';
import { notice } from '../ui/messages.mjs';
import { go, rerender } from '../core/router.mjs';
import { abrirRevisao } from './decisoes.mjs';
import { pedirAprovacao } from '../core/actions.mjs';

const filtro = { texto: '', modalidade: '', ordem: 'aderencia' };

export function oportunidadesScreen() {
  const itens = aplicarFiltro(store.estado?.queue?.items ?? []);
  return el('div', { class: 'area', style: 'padding:0' }, [
    el('div', { class: 'area-titulo' }, [
      el('p', { class: 'etiqueta', text: 'oportunidades' }),
      el('h1', { text: 'Vagas encontradas para o seu objetivo' }),
      el('p', { class: 'leitura secundario', text: 'A ordenação usa a aderência calculada com os seus dados confirmados. Filtrar esta lista não altera os critérios da campanha.' })
    ]),
    filtros(),
    listDetail({
      area: 'oportunidades',
      items: itens,
      onSelect: () => rerender(),
      renderItem: (item) => [
        el('div', {}, [
          el('p', { class: 'item-titulo quebra', text: item.role || 'Cargo não informado' }),
          el('p', { class: 'item-apoio quebra', text: `${item.company || 'Empresa não informada'} · ${item.location || 'local não informado'} · ${item.workMode || 'modalidade não informada'}` }),
          el('p', { class: 'apoio quebra', text: motivo(item) })
        ]),
        el('div', { class: 'item-direita' }, [
          badge(rotuloAderencia(item), tomAderencia(item)),
          el('span', { class: 'apoio', text: salario(item.salary) }),
          el('span', { class: 'apoio', text: item.platform || 'origem não informada' })
        ])
      ],
      renderDetail: (item) => detalhe(item),
      emptyState: panel({
        children: emptyState(
          'Nenhuma oportunidade na lista',
          store.estado?.discovery?.collectedAt
            ? 'A busca já rodou e nada passou pelos seus critérios. Você pode ajustar filtros da campanha ou manter o acompanhamento agendado.'
            : 'Assim que a busca rodar, as vagas observadas aparecem aqui com empresa, local, origem e o motivo da recomendação.',
          button('Iniciar uma busca', { onClick: () => go('primeiro-uso') })
        )
      })
    })
  ]);
}

function filtros() {
  const texto = el('input', { id: 'filtro-texto', value: filtro.texto, placeholder: 'cargo ou empresa', onInput: (evento) => { filtro.texto = evento.target.value; rerender(); } });
  const modalidade = el('select', { id: 'filtro-modalidade', onChange: (evento) => { filtro.modalidade = evento.target.value; rerender(); } }, [
    el('option', { value: '', text: 'todas as modalidades', selected: filtro.modalidade === '' }),
    ...['Remoto', 'Híbrido', 'Presencial'].map((valor) => el('option', { value: valor, text: valor.toLowerCase(), selected: filtro.modalidade === valor }))
  ]);
  const ordem = el('select', { id: 'filtro-ordem', onChange: (evento) => { filtro.ordem = evento.target.value; rerender(); } }, [
    el('option', { value: 'aderencia', text: 'maior aderência', selected: filtro.ordem === 'aderencia' }),
    el('option', { value: 'recentes', text: 'mais recentes', selected: filtro.ordem === 'recentes' }),
    el('option', { value: 'empresa', text: 'empresa (A–Z)', selected: filtro.ordem === 'empresa' })
  ]);
  return el('div', { class: 'painel' }, [
    el('div', { class: 'filtros' }, [
      field({ label: 'Buscar na lista', control: texto }),
      field({ label: 'Modalidade', control: modalidade }),
      field({ label: 'Ordenar por', control: ordem })
    ]),
    el('p', { class: 'apoio', text: 'Estes controles só mudam a visualização. Para alterar o que o Fluxo procura, ajuste os critérios da campanha em Configurações.' })
  ]);
}

function detalhe(item) {
  const requisitos = [item.requirements].flat().filter(Boolean);
  const eliminatorios = [item.eliminators].flat().filter(Boolean);
  return panel({
    kicker: 'detalhe da oportunidade',
    title: item.role || 'Cargo não informado',
    children: [
      definitions([
        ['Empresa', item.company],
        ['Plataforma', item.platform],
        ['Local', item.location],
        ['Modalidade', item.workMode],
        ['Faixa salarial', item.salary || 'não informada pela empresa'],
        ['Prazo', item.deadline || 'sem prazo divulgado'],
        ['Origem', item.source || item.platform],
        ['Observado em', frescor(item.sourceObservedAt ?? item.collectedAt, { prefixo: 'Observado' })],
        ['Situação na fila', item.status]
      ]),
      el('p', { class: 'etiqueta', text: 'por que esta vaga foi recomendada' }),
      el('p', { class: 'leitura quebra', text: motivo(item) }),
      requisitos.length ? el('div', {}, [
        el('p', { class: 'etiqueta', text: 'requisitos observados' }),
        el('ul', {}, requisitos.map((requisito) => el('li', { class: 'quebra', text: `• ${requisito}` })))
      ]) : null,
      eliminatorios.length ? el('div', { class: 'aviso', dataset: { tom: 'atencao' } }, [
        el('div', {}, [
          el('p', { text: 'Requisitos eliminatórios observados nesta vaga:' }),
          el('p', { class: 'quebra apoio', text: eliminatorios.join(', ') })
        ])
      ]) : null,
      el('p', { class: 'apoio', text: 'A aderência é uma justificativa a partir dos seus dados confirmados e da descrição observada. Não é probabilidade de contratação.' }),
      el('div', { class: 'linha-acoes' }, [
        button('Preparar candidatura para revisão', {
          id: 'preparar-candidatura',
          onClick: async (evento) => {
            const botao = evento.currentTarget;
            botao.disabled = true;
            botao.setAttribute('aria-busy', 'true');
            try {
              const preparada = await prepararCandidatura({ itemId: item.id });
              const { aprovacao } = await pedirAprovacao(preparada);
              rerender();
              if (aprovacao?.id) abrirRevisao({ ...aprovacao, payloadSummary: { payload: { queueItemId: preparada.item?.id, fields: preparada.snapshot, resume: preparada.resume?.path } } });
            } catch (error) {
              notice(error.message, 'erro');
            } finally {
              botao.disabled = false;
              botao.removeAttribute('aria-busy');
            }
          }
        }),
        item.identifierOrUrl?.startsWith('http')
          ? el('a', { class: 'botao botao-secundario', href: item.identifierOrUrl, target: '_blank', rel: 'noreferrer noopener', text: 'Abrir a vaga na plataforma' })
          : null
      ])
    ]
  });
}

function motivo(item) {
  const partes = [];
  const nota = Number(item.fitScore ?? 0);
  if (nota > 0) partes.push(`${nota}% dos requisitos observados coincidem com seus dados confirmados`);
  if (item.priority) partes.push(`prioridade ${item.priority}`);
  if ([item.eliminators].flat().filter(Boolean).length) partes.push('há requisito eliminatório a conferir');
  if (!partes.length) partes.push('aderência ainda não calculada para esta vaga');
  return partes.join(' · ');
}

function rotuloAderencia(item) {
  const nota = Number(item.fitScore ?? 0);
  if ([item.eliminators].flat().filter(Boolean).length) return 'requisito eliminatório';
  if (!nota) return 'aderência não calculada';
  if (nota >= 80) return `aderência forte · ${nota}%`;
  if (nota >= 50) return `aderência possível · ${nota}%`;
  return `aderência fraca · ${nota}%`;
}

function tomAderencia(item) {
  const nota = Number(item.fitScore ?? 0);
  if ([item.eliminators].flat().filter(Boolean).length) return 'erro';
  if (nota >= 80) return 'sucesso';
  if (nota >= 50) return 'informacao';
  return '';
}

function aplicarFiltro(itens) {
  const termo = filtro.texto.trim().toLocaleLowerCase();
  const filtrados = itens.filter((item) => {
    const combina = !termo || `${item.role ?? ''} ${item.company ?? ''}`.toLocaleLowerCase().includes(termo);
    const modalidade = !filtro.modalidade || String(item.workMode ?? '').toLocaleLowerCase().includes(filtro.modalidade.toLocaleLowerCase());
    return combina && modalidade;
  });
  const ordenadores = {
    aderencia: (a, b) => Number(b.fitScore ?? 0) - Number(a.fitScore ?? 0),
    recentes: (a, b) => String(b.addedAt ?? '').localeCompare(String(a.addedAt ?? '')),
    empresa: (a, b) => String(a.company ?? '').localeCompare(String(b.company ?? ''), 'pt-BR')
  };
  return [...filtrados].sort(ordenadores[filtro.ordem] ?? ordenadores.aderencia);
}
