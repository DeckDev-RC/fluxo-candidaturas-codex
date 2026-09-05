// Objetivo profissional ativo: leitura do fato confirmado e diálogo de mudança.
// A alteração vale para as próximas buscas; o trabalho já preparado não muda.

import { el, field } from '../../core/dom.mjs';
import { store } from '../../core/store.mjs';
import { atualizarObjetivo } from '../../core/actions.mjs';
import { describeError } from '../../core/api.mjs';
import { rerender } from '../../core/router.mjs';
import { openDialog } from '../../ui/dialog.mjs';
import { notice } from '../../ui/messages.mjs';

export function objetivoAtivo() {
  const valor = store.estado?.memory?.facts?.targetRoles?.value;
  if (Array.isArray(valor)) return valor.join(', ');
  return String(valor ?? '').trim();
}

// `inicial` permite pré-preencher com um texto proposto (ex.: pela conversa); a
// pessoa ainda revisa e salva.
export function abrirMudancaDeObjetivo({ aoSalvar, inicial } = {}) {
  const entrada = el('textarea', { id: 'novo-objetivo', rows: 2, value: inicial ?? objetivoAtivo() });
  openDialog({
    title: 'Mudar objetivo profissional',
    body: [
      field({ label: 'Novo objetivo', control: entrada, help: 'Vale para as próximas buscas.' }),
      el('p', { class: 'leitura apoio', text: 'O trabalho já preparado continua como está. Candidaturas confirmadas não são alteradas.' })
    ],
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Salvar objetivo',
        variant: 'primario',
        onSelect: async () => {
          const texto = entrada.value.trim();
          if (!texto) { notice('Escreva o novo objetivo para salvar.', 'atencao'); return false; }
          try { await atualizarObjetivo(texto); aoSalvar?.(); rerender(); }
          catch (error) { notice(describeError(error), 'erro'); return false; }
          return true;
        }
      }
    ]
  });
}
