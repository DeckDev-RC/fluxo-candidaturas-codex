// Candidaturas: um detalhe único por processo, sem digitar identificador.
// Novidade observada e registro manual ficam diferenciados (U5-04 a U5-06).

import { badge, button, definitions, el, emptyState, field, panel } from '../core/dom.mjs';
import { dataHora, frescor } from '../core/format.mjs';
import { store } from '../core/store.mjs';
import { agendarAcompanhamento, conferirEnvio, consultarNovidades } from '../core/actions.mjs';
import { send } from '../core/api.mjs';
import { listDetail } from '../ui/list-detail.mjs';
import { openDialog } from '../ui/dialog.mjs';
import { notice } from '../ui/messages.mjs';
import { rerender } from '../core/router.mjs';

const SITUACOES = {
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

export function candidaturasScreen() {
  const itens = [...(store.estado?.applications?.items ?? [])].reverse();
  return el('div', { class: 'area', style: 'padding:0' }, [
    el('div', { class: 'area-titulo' }, [
      el('p', { class: 'etiqueta', text: 'candidaturas' }),
      el('h1', { text: 'Onde está cada processo' }),
      el('p', { class: 'leitura secundario', text: 'Cada candidatura reúne a vaga, o documento enviado, as respostas, o histórico e a próxima ação. Um registro feito por você é sempre distinguido de uma observação da plataforma.' })
    ]),
    acompanhamentoPanel(),
    listDetail({
      area: 'candidaturas',
      items: itens,
      onSelect: () => rerender(),
      renderItem: (item) => [
        el('div', {}, [
          el('p', { class: 'item-titulo quebra', text: `${item.role || 'Vaga'} — ${item.company || 'empresa não informada'}` }),
          el('p', { class: 'item-apoio', text: `${item.platform || 'plataforma não informada'} · enviada em ${dataHora(item.date ?? item.createdAt)}` }),
          el('p', { class: 'apoio', text: item.nextAction || 'sem próxima ação registrada' })
        ]),
        el('div', { class: 'item-direita' }, [
          badge(...situacao(item.status)),
          el('span', { class: 'apoio', text: frescor(item.lastCheckedAt, { prefixo: 'Verificado' }) })
        ])
      ],
      renderDetail: (item) => detalhe(item),
      emptyState: panel({
        children: emptyState(
          'Nenhuma candidatura registrada',
          'Uma candidatura entra aqui quando a plataforma confirma o recebimento. Rascunhos e tentativas sem confirmação não contam para a meta.'
        )
      })
    })
  ]);
}

function acompanhamentoPanel() {
  const agenda = store.agenda.find((job) => job.id === 'followup');
  const ciclo = store.politica?.lifecycle ?? 'A agenda funciona enquanto o aplicativo estiver aberto e retoma ao reabrir.';
  return panel({
    kicker: 'acompanhamento',
    title: 'Novidades das plataformas',
    actions: [
      button('Consultar agora', { onClick: () => executar(consultarNovidades) }),
      button('Agendar a cada 30 min', { variant: 'secundario', onClick: () => executar(() => agendarAcompanhamento(30)) })
    ],
    children: [
      el('p', { class: 'leitura apoio', text: ciclo }),
      agenda
        ? el('p', { class: 'apoio', id: 'agenda-status', text: `Próxima consulta automática: ${dataHora(agenda.nextAt)}. Intervalo de ${Math.round((agenda.intervalMs ?? 0) / 60000)} minutos.` })
        : el('p', { class: 'apoio', id: 'agenda-status', text: 'Nenhuma consulta automática agendada. Você pode consultar quando quiser.' }),
      store.notificacoes.length
        ? el('ul', { class: 'lista' }, store.notificacoes.slice(-4).reverse().map((item) => el('li', {}, [
          el('div', { class: 'item-lista', role: 'none', style: 'cursor:default' }, [
            el('div', {}, [
              el('p', { class: 'item-titulo quebra', text: item.title ?? 'Novidade' }),
              el('p', { class: 'item-apoio quebra', text: item.body || item.nextAction || '' })
            ]),
            el('div', { class: 'item-direita' }, [el('span', { class: 'apoio', text: dataHora(item.createdAt) })])
          ])
        ])))
        : null
    ]
  });
}

const PASSOS_RECUPERACAO = {
  reconcile: 'Conferir compara a página observada com o envio salvo. Nada é reenviado nesta ação.',
  record_once: 'A plataforma já confirmou. A candidatura será registrada uma única vez, sem novo envio.',
  reopen_review: 'O envio não chegou a acontecer. Reabra a revisão e aprove novamente quando quiser.',
  inspect: 'Abra a vaga na plataforma e verifique o estado antes de qualquer nova ação.'
};

function detalhe(item) {
  const eventos = [item.history].flat().filter(Boolean);
  if (item.status === 'rascunho' || item.needsReconcile) queueMicrotask(() => orientarRecuperacao(item));
  return panel({
    kicker: 'processo',
    title: `${item.role || 'Vaga'} — ${item.company || 'empresa não informada'}`,
    children: [
      definitions([
        ['Situação', situacao(item.status)[0]],
        ['Plataforma', item.platform],
        ['Identificação na plataforma', item.applicationId || 'não fornecida pela plataforma'],
        ['Endereço', item.identifierOrUrl],
        ['Currículo enviado', item.resume || 'não registrado'],
        ['Enviada em', dataHora(item.date ?? item.createdAt)],
        ['Última verificação', frescor(item.lastCheckedAt, { prefixo: 'Verificado' })],
        ['Evidência guardada', item.evidencePath || 'sem evidência local'],
        ['Próxima ação', item.nextAction || 'nenhuma ação pendente']
      ]),
      item.status === 'rascunho' || item.needsReconcile
        ? el('div', { class: 'aviso', dataset: { tom: 'atencao' }, id: 'recuperacao' }, [
          el('div', {}, [
            el('p', { text: 'Este envio ficou sem confirmação da plataforma.' }),
            el('p', { class: 'apoio', id: 'recuperacao-passo', text: 'Carregando a orientação de recuperação…' }),
            el('div', { class: 'linha-acoes' }, [
              button('Conferir na plataforma', { onClick: () => executar(() => conferirEnvio(item.runId ?? '')) }),
              item.identifierOrUrl?.startsWith('http')
                ? el('a', { class: 'botao botao-secundario', href: item.identifierOrUrl, target: '_blank', rel: 'noreferrer noopener', text: 'Abrir a vaga para verificar' })
                : null
            ])
          ])
        ])
        : null,
      el('p', { class: 'etiqueta', text: 'histórico' }),
      eventos.length
        ? el('ul', {}, eventos.slice().reverse().map((evento) => el('li', { class: 'quebra' }, [
          el('p', { text: `${dataHora(evento.at ?? evento.occurredAt)} — ${evento.note ?? evento.status ?? evento.type ?? 'atualização'}` }),
          el('p', { class: 'apoio', text: evento.source ? `observado na plataforma · ${evento.source}` : 'registrado por você' })
        ])))
        : el('p', { class: 'apoio', text: 'Nenhum evento registrado além do envio.' }),
      el('div', { class: 'linha-acoes' }, [
        button('Adicionar informação que recebi', { variant: 'secundario', onClick: () => abrirRegistroManual(item) })
      ])
    ]
  });
}

// Registro manual é complemento: fica marcado como informado por você (U5-05).
function abrirRegistroManual(item) {
  const tipo = el('select', { id: 'evento-tipo' }, Object.keys(SITUACOES).map((valor) => el('option', { value: valor, text: SITUACOES[valor][0] })));
  const nota = el('textarea', { id: 'evento-nota', rows: 3, placeholder: 'Ex.: recebi convite por e-mail para entrevista na quinta' });
  const proxima = el('input', { id: 'evento-proxima', placeholder: 'Ex.: responder até sexta' });
  openDialog({
    title: 'Adicionar informação a esta candidatura',
    body: [
      el('p', { class: 'leitura apoio', text: 'Isto registra o que você recebeu por fora. A informação fica marcada como registro manual e não é confundida com observação da plataforma.' }),
      field({ label: 'Nova situação', control: tipo }),
      field({ label: 'O que aconteceu', control: nota }),
      field({ label: 'Próxima ação', control: proxima })
    ],
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Registrar',
        variant: 'primario',
        onSelect: async () => {
          try {
            await send(`/api/v1/applications/${encodeURIComponent(item.id ?? item.key)}/events`, {
              status: tipo.value,
              note: nota.value.trim(),
              nextAction: proxima.value.trim(),
              source: 'registro manual do candidato'
            });
            notice('Informação registrada no histórico desta candidatura.', 'sucesso');
            const { loadState } = await import('../core/store.mjs');
            await loadState();
            rerender();
          } catch (error) {
            notice(error.message, 'erro');
            return false;
          }
          return true;
        }
      }
    ]
  });
}

// A orientação vem do serviço de recuperação: a interface não inventa o passo seguro.
async function orientarRecuperacao(item) {
  const alvo = document.querySelector('#recuperacao-passo');
  if (!alvo) return;
  try {
    const guia = await send('/api/v1/recovery/guide', {
      phase: item.recoveryPhase ?? 'after_uncertain_click',
      runId: item.runId ?? '',
      pageUrl: item.identifierOrUrl ?? ''
    });
    alvo.textContent = PASSOS_RECUPERACAO[guia.next?.action] ?? guia.message;
  } catch {
    alvo.textContent = 'Conferir abre a página observada e compara o resultado. O Fluxo não repete o clique de envio.';
  }
}

function situacao(status) {
  return SITUACOES[status] ?? [status || 'sem situação', ''];
}

async function executar(acao) {
  try { await acao(); rerender(); } catch (error) { notice(error.message, 'erro'); }
}
