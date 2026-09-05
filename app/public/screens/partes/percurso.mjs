// Percurso da jornada: etapas reais com o estado que o serviço persistiu.
// Sem porcentagem nem tempo restante estimado (seção 5).

import { badge, button, el, panel } from '../../core/dom.mjs';
import { store } from '../../core/store.mjs';
import { notice } from '../../ui/messages.mjs';

const SITUACOES = {
  succeeded: ['concluída', 'sucesso'],
  running: ['em andamento', 'acao'],
  waiting_user: ['esperando você', 'atencao'],
  needs_attention: ['precisa de atenção', 'erro'],
  pending: ['ainda não começou', '']
};

export function journeyPanel(jornada) {
  const conexao = jornada.conexao === 'reconectando'
    ? el('p', { class: 'apoio', text: `Conexão com a execução caiu. Tentando de novo em ${Math.round((jornada.esperaMs ?? 1000) / 1000)}s.` })
    : null;

  return panel({
    kicker: 'como o Fluxo chegou aqui',
    title: 'Etapas desta jornada',
    id: 'painel-percurso',
    children: [
      conexao,
      journeySteps(jornada),
      el('details', { class: 'suporte' }, [
        el('summary', { text: 'Ver o trabalho dos especialistas' }),
        el('div', { class: 'regiao-mensagens' }, (jornada.atualizacoes ?? []).slice(-8).reverse().map((item) => el('p', {
          class: 'apoio quebra',
          text: item.texto
        }))),
        el('p', { class: 'apoio', text: 'Cada linha mostra a tarefa, o resultado observado e a consequência. Você não precisa administrar os especialistas.' }),
        button('Exportar evidências desta jornada', { variant: 'texto', onClick: exportarEvidencias })
      ])
    ]
  });
}

// Só a lista de etapas, para compor em outros lugares (acompanhamento).
export function journeySteps(jornada) {
  return el('ol', { class: 'percurso', id: 'percurso' }, (jornada.plano ?? []).map((etapa) => {
    const [rotulo, tom] = SITUACOES[etapa.status] ?? SITUACOES.pending;
    return el('li', { dataset: { status: etapa.status ?? 'pending' } }, [
      el('span', { class: 'marco', 'aria-hidden': 'true' }),
      el('div', {}, [
        el('p', { class: 'etapa-nome', text: etapa.label ?? etapa.id }),
        badge(rotulo, tom)
      ])
    ]);
  }));
}

async function exportarEvidencias() {
  const runId = store.jornada.runId;
  if (!runId) { notice('Ainda não há uma jornada com evidências para exportar.', 'informacao'); return; }
  try {
    const { send } = await import('../../core/api.mjs');
    await send(`/api/v1/audit/${encodeURIComponent(runId)}/export`, {});
    notice('Pacote de evidências criado neste computador, na pasta de saída.', 'sucesso');
  } catch (error) {
    notice(error.message, 'erro');
  }
}
