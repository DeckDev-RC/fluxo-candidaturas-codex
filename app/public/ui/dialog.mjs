// Diálogo com entrada e retorno de foco, sem armadilha de teclado (U8-02).
// Enquanto uma ação está em curso, os botões ficam ocupados: nada é decidido
// duas vezes por um clique repetido.

import { el, replace } from '../core/dom.mjs';
import { notice } from './messages.mjs';
import { rerender } from '../core/router.mjs';

export function openDialog({ title, body, actions = [] }) {
  const dialogo = document.querySelector('#dialogo');
  // Abrir sobre outro diálogo: o anterior é fechado sem devolver foco a um nó já trocado.
  if (dialogo.open) dialogo.close();
  const anterior = document.activeElement;
  document.querySelector('#dialogo-titulo').textContent = title;
  replace(document.querySelector('#dialogo-corpo'), body);
  const botoes = actions.map((acao) => el('button', {
    type: 'button',
    class: acao.variant === 'primario' ? 'botao' : acao.variant === 'perigo' ? 'botao botao-perigo' : 'botao botao-secundario',
    text: acao.label,
    onClick: async (evento) => {
      // currentTarget é zerado quando o evento termina: guardar antes do await.
      const acionado = evento.currentTarget;
      for (const botao of botoes) botao.disabled = true;
      acionado.setAttribute('aria-busy', 'true');
      let fechar = true;
      try { fechar = (await acao.onSelect?.()) !== false; }
      catch (error) { notice(error?.message ?? String(error), 'erro'); fechar = false; }
      finally {
        for (const botao of botoes) botao.disabled = false;
        acionado.removeAttribute('aria-busy');
      }
      if (fechar) dialogo.close();
    }
  }));
  replace(document.querySelector('#dialogo-acoes'), botoes);
  // Ao fechar: foco de volta ao gatilho e repintura, porque a tela não repinta
  // enquanto o diálogo está aberto e pode ter novidade acumulada.
  dialogo.addEventListener('close', () => { if (anterior?.isConnected) anterior.focus?.(); rerender(); }, { once: true });
  dialogo.showModal();
  dialogo.querySelector('input, textarea, select, button')?.focus();
  return dialogo;
}
