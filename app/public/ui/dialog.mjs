// Diálogo com entrada e retorno de foco, sem armadilha de teclado (U8-02).

import { el, replace } from '../core/dom.mjs';

export function openDialog({ title, body, actions = [] }) {
  const dialogo = document.querySelector('#dialogo');
  const anterior = document.activeElement;
  document.querySelector('#dialogo-titulo').textContent = title;
  replace(document.querySelector('#dialogo-corpo'), body);
  replace(document.querySelector('#dialogo-acoes'), actions.map((acao) => el('button', {
    type: 'button',
    class: acao.variant === 'primario' ? 'botao' : acao.variant === 'perigo' ? 'botao botao-perigo' : 'botao botao-secundario',
    text: acao.label,
    onClick: async () => {
      const fechar = await acao.onSelect?.();
      if (fechar !== false) dialogo.close();
    }
  })));
  dialogo.addEventListener('close', () => anterior?.focus?.(), { once: true });
  dialogo.showModal();
  dialogo.querySelector('input, textarea, select, button')?.focus();
  return dialogo;
}

export function closeDialog() {
  document.querySelector('#dialogo')?.close();
}
