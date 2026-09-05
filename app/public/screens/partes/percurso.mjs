// Percurso da jornada: etapas reais com o estado que o serviço persistiu.
// Sem porcentagem nem tempo restante estimado (seção 5).

import { badge, el } from '../../core/dom.mjs';
import { send } from '../../core/api.mjs';
import { store } from '../../core/store.mjs';
import { notice } from '../../ui/messages.mjs';

const SITUACOES = {
  succeeded: ['concluída', 'sucesso'],
  running: ['em andamento', 'acao'],
  waiting_user: ['esperando você', 'atencao'],
  needs_attention: ['precisa de atenção', 'erro'],
  pending: ['ainda não começou', '']
};

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

// Pacote de evidências da jornada em curso, gravado na pasta de saída local.
export async function exportarEvidencias() {
  const runId = store.jornada.runId;
  if (!runId) { notice('Ainda não há uma jornada com evidências para exportar.', 'informacao'); return; }
  await send(`/api/v1/audit/${encodeURIComponent(runId)}/export`, {});
  notice('Pacote de evidências criado neste computador, na pasta de saída.', 'sucesso');
}
