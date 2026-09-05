// Preparar uma candidatura e abrir a revisão pré-envio. Usado na lista de
// oportunidades e no cartão da conversa: um só caminho até o portão humano.

import { button } from '../../core/dom.mjs';
import { pedirAprovacao, prepararCandidatura } from '../../core/actions.mjs';
import { notice } from '../../ui/messages.mjs';
import { rerender } from '../../core/router.mjs';
import { abrirRevisao } from '../decisoes.mjs';

export function botaoPreparar(item, { rotulo = 'Preparar candidatura para revisão', variant = 'primario', id } = {}) {
  return button(rotulo, {
    id,
    variant,
    'aria-label': `${rotulo}: ${item.role ?? 'vaga'} em ${item.company ?? 'empresa não informada'}`,
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
  });
}
