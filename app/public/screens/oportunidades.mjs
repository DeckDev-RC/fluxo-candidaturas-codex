// Oportunidades: lista comparável sem abrir cada vaga, com motivo da
// recomendação e dado ausente identificado (U5-01 a U5-03).

import { badge, button, definitions, el, emptyState, field, panel, screen } from '../core/dom.mjs';
import { nivelAderencia } from '../core/aderencia.mjs';
import { frescor, salario } from '../core/format.mjs';
import { situacaoFila } from '../core/rotulos.mjs';
import { loadState, store } from '../core/store.mjs';
import { send } from '../core/api.mjs';
import { notice } from '../ui/messages.mjs';
import { listDetail } from '../ui/list-detail.mjs';
import { go, rerender } from '../core/router.mjs';
import { botaoPreparar } from './partes/preparar-candidatura.mjs';

const filtro = { texto: '', modalidade: '', ordem: 'aderencia', situacao: 'ativas' };
const ATIVAS = new Set(['na fila', 'em andamento']);

export function oportunidadesScreen() {
  const itens = aplicarFiltro(store.estado?.queue?.items ?? []);
  return screen({
    title: 'Vagas encontradas para o seu objetivo',
    lead: 'A ordenação usa a aderência calculada com os seus dados confirmados. Filtrar esta lista não altera o que a busca procura.',
    children: [
    filtros(),
    listDetail({
      area: 'oportunidades',
      items: itens,
      // Agrupadas pela busca que as trouxe, a mais recente primeiro: o que é de agora
      // fica separado do que sobrou de buscas anteriores.
      groupBy: (item) => rotuloDaBusca(item),
      onSelect: () => rerender(),
      renderItem: (item) => [
        el('div', {}, [
          el('p', { class: 'item-titulo quebra', text: item.role || 'Cargo não informado' }),
          el('p', { class: 'item-apoio quebra', text: `${item.company || 'Empresa não informada'} · ${item.location || 'local não informado'} · ${item.workMode || 'modalidade não informada'}` }),
          el('p', { class: 'apoio quebra', text: motivo(item) })
        ]),
        el('div', { class: 'item-direita' }, [
          badge(nivelAderencia(item).rotulo, nivelAderencia(item).tom),
          el('span', { class: 'apoio', text: salario(item.salary) }),
          el('span', { class: 'apoio', text: item.platform || 'origem não informada' })
        ])
      ],
      renderDetail: (item) => detalhe(item),
      emptyState: panel({
        children: emptyState(
          'Nenhuma oportunidade na lista',
          store.estado?.discovery?.collectedAt
            ? 'A busca já rodou e nada passou pelos seus critérios. Você pode ajustar plataformas e metas ou manter o acompanhamento agendado.'
            : 'Assim que a busca rodar, as vagas observadas aparecem aqui com empresa, local, origem e o motivo da recomendação.',
          button('Iniciar uma nova busca', { onClick: () => go('primeiro-uso') })
        )
      })
    })
  ] });
}

function filtros() {
  // A repintura troca o campo: o foco e o cursor voltam para onde a pessoa digitava.
  const texto = el('input', { id: 'filtro-texto', value: filtro.texto, placeholder: 'cargo ou empresa', onInput: (evento) => { filtro.texto = evento.target.value; const cursor = evento.target.selectionStart; rerender(); const novo = document.querySelector('#filtro-texto'); novo?.focus(); novo?.setSelectionRange(cursor, cursor); } });
  const modalidade = el('select', { id: 'filtro-modalidade', onChange: (evento) => { filtro.modalidade = evento.target.value; rerender(); } }, [
    el('option', { value: '', text: 'todas as modalidades', selected: filtro.modalidade === '' }),
    ...['Remoto', 'Híbrido', 'Presencial'].map((valor) => el('option', { value: valor, text: valor.toLowerCase(), selected: filtro.modalidade === valor }))
  ]);
  const ordem = el('select', { id: 'filtro-ordem', onChange: (evento) => { filtro.ordem = evento.target.value; rerender(); } }, [
    el('option', { value: 'aderencia', text: 'maior aderência', selected: filtro.ordem === 'aderencia' }),
    el('option', { value: 'recentes', text: 'mais recentes', selected: filtro.ordem === 'recentes' }),
    el('option', { value: 'empresa', text: 'empresa (A–Z)', selected: filtro.ordem === 'empresa' })
  ]);
  // Vagas descartadas ficam guardadas (a busca não as traz de volta), mas fora da vista por padrão.
  const descartadas = (store.estado?.queue?.items ?? []).filter((item) => item.status === 'descartada').length;
  const situacao = el('select', { id: 'filtro-situacao', onChange: (evento) => { filtro.situacao = evento.target.value; rerender(); } }, [
    el('option', { value: 'ativas', text: 'ativas na fila', selected: filtro.situacao === 'ativas' }),
    el('option', { value: 'descartadas', text: `descartadas (${descartadas})`, selected: filtro.situacao === 'descartadas' }),
    el('option', { value: 'todas', text: 'todas', selected: filtro.situacao === 'todas' })
  ]);
  return el('div', { class: 'painel' }, [
    el('div', { class: 'filtros' }, [
      field({ label: 'Buscar na lista', control: texto }),
      field({ label: 'Modalidade', control: modalidade }),
      field({ label: 'Ordenar por', control: ordem }),
      field({ label: 'Mostrar', control: situacao })
    ]),
    el('p', { class: 'apoio', text: 'Estes controles só mudam a visualização. O que o Fluxo procura vem do seu objetivo e das plataformas habilitadas em Configurações.' })
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
        ['Situação na fila', situacaoFila(item.status)[0]]
      ]),
      el('p', { class: 'etiqueta', text: 'por que esta vaga foi recomendada' }),
      el('p', { class: 'leitura quebra', text: motivo(item) }),
      requisitos.length ? el('div', {}, [
        el('p', { class: 'etiqueta', text: 'requisitos observados' }),
        el('ul', { class: 'marcadores' }, requisitos.map((requisito) => el('li', { class: 'quebra', text: requisito })))
      ]) : null,
      eliminatorios.length ? el('div', { class: 'aviso', dataset: { tom: 'atencao' } }, [
        el('div', {}, [
          el('p', { text: 'Requisitos eliminatórios observados nesta vaga:' }),
          el('p', { class: 'quebra apoio', text: eliminatorios.join(', ') })
        ])
      ]) : null,
      el('p', { class: 'apoio', text: 'A aderência é uma justificativa a partir dos seus dados confirmados e da descrição observada. Não é probabilidade de contratação.' }),
      el('div', { class: 'linha-acoes' }, [
        ATIVAS.has(item.status) ? botaoPreparar(item, { id: 'preparar-candidatura' }) : null,
        item.identifierOrUrl?.startsWith('http')
          ? el('a', { class: 'botao botao-secundario', href: item.identifierOrUrl, target: '_blank', rel: 'noreferrer noopener', text: 'Abrir a vaga na plataforma' })
          : null,
        ATIVAS.has(item.status)
          ? button('Descartar esta vaga', { variant: 'texto', 'aria-label': `Descartar ${item.role ?? 'vaga'} em ${item.company ?? 'empresa não informada'}`, onClick: async () => { await descartarVaga(item); } })
          : null
      ]),
      item.status === 'descartada' ? el('p', { class: 'apoio', text: `Descartada${item.discardReason ? `: ${item.discardReason}` : ''}. A busca não a traz de volta como novidade.` }) : null
    ]
  });
}

// Descartar é decisão da pessoa e sai da fila ativa na hora; a vaga fica em "descartadas".
async function descartarVaga(item) {
  await send('/api/v1/queue/discard', { ids: [item.id], reason: 'descartada pela pessoa na lista de oportunidades' });
  notice(`"${item.role ?? 'Vaga'}" em ${item.company ?? 'empresa não informada'} foi descartada. Ela não volta na próxima busca.`, 'informacao');
  await loadState();
  rerender();
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



function aplicarFiltro(itens) {
  const termo = filtro.texto.trim().toLocaleLowerCase();
  const filtrados = itens.filter((item) => {
    const combina = !termo || `${item.role ?? ''} ${item.company ?? ''}`.toLocaleLowerCase().includes(termo);
    const modalidade = !filtro.modalidade || String(item.workMode ?? '').toLocaleLowerCase().includes(filtro.modalidade.toLocaleLowerCase());
    const situacao = filtro.situacao === 'todas' || (filtro.situacao === 'descartadas' ? item.status === 'descartada' : ATIVAS.has(item.status));
    return combina && modalidade && situacao;
  });
  const ordenadores = {
    aderencia: (a, b) => Number(b.fitScore ?? 0) - Number(a.fitScore ?? 0),
    recentes: (a, b) => String(b.addedAt ?? '').localeCompare(String(a.addedAt ?? '')),
    empresa: (a, b) => String(a.company ?? '').localeCompare(String(b.company ?? ''), 'pt-BR')
  };
  const dentroDoGrupo = ordenadores[filtro.ordem] ?? ordenadores.aderencia;
  // Primeiro a busca (mais recente antes), depois a ordem escolhida dentro de cada busca.
  return [...filtrados].sort((a, b) => chaveDaBusca(b).localeCompare(chaveDaBusca(a)) || dentroDoGrupo(a, b));
}

// Buscas são agrupadas pelo minuto em que rodaram e pelo termo; vagas antigas sem marca ficam juntas.
function chaveDaBusca(item) {
  const instante = String(item.searchAt ?? item.collectedAt ?? '');
  return instante ? `${instante.slice(0, 16)}|${item.searchQuery ?? ''}` : '';
}

function rotuloDaBusca(item) {
  const key = chaveDaBusca(item);
  if (!key) return { key: '', label: 'Buscas anteriores' };
  const instante = new Date(String(item.searchAt ?? item.collectedAt));
  const hora = Number.isNaN(instante.getTime()) ? '' : instante.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return { key, label: `Busca de ${hora}${item.searchQuery ? ` · ${item.searchQuery}` : ''}` };
}
