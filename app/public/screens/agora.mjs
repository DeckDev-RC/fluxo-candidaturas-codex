// Tela principal: a conversa com o Fluxo à esquerda e o acompanhamento, somente
// de leitura, à direita. A situação atual vem do estado persistido, não do
// último texto da conversa (seções 2 e 5 do checklist de UI/UX).

import { el } from '../core/dom.mjs';
import { decisions, store } from '../core/store.mjs';
import { resolveNowState } from './agora-estados.mjs';
import { conversationColumn } from './partes/conversa.mjs';
import { trackingPanel } from './partes/acompanhamento.mjs';

export function agoraScreen() {
  const { estado, perfil, ia, jornada } = store;
  const pendentes = decisions();
  const situacao = resolveNowState({ estado, jornada, decisoes: pendentes, perfil, ia });

  return el('div', { class: 'mesa', dataset: { estadoAgora: situacao.estado } }, [
    conversationColumn(situacao, pendentes),
    trackingPanel(situacao)
  ]);
}
