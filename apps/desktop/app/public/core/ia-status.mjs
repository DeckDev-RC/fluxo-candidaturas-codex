// Conexão com a IA em tempo real. O login termina fora do app (navegador); o
// serviço local ouve o app-server e empurra cada mudança por SSE. Ninguém
// precisa perguntar de novo. O foco da janela é só uma reserva para o caso de
// a conexão de eventos ter caído.

import { loadAiStatus, setAiHealth, store } from './store.mjs';
import { notice } from '../ui/messages.mjs';

const INTERVALO_FOCO_MS = 3000;
let fonte = null;

export function connectAiStatus() {
  if (fonte) return;
  // O primeiro evento de cada conexão é o retrato atual, não uma mudança: só a
  // transição para conectado (ou uma falha de login) merece aviso.
  let retratoInicial = true;
  fonte = new EventSource('/api/v1/runtime/health?stream=1');
  fonte.addEventListener('runtime.health', (evento) => {
    const saude = parse(evento.data);
    if (!saude) return;
    const skynetAntes = store.ia.provedores?.skynet?.available === true;
    const codexAntes = store.ia.provedores?.codex?.available === true;
    setAiHealth(saude);
    if (!retratoInicial) {
      if (saude.providers?.skynet?.available && !skynetAntes) notice('Conversa do SkynetChat conectada.', 'sucesso');
      if (saude.providers?.codex?.available && !codexAntes) notice('ChatGPT/Codex conectado. As operações no navegador estão disponíveis.', 'sucesso');
      if (saude.loginError && !saude.available) notice(saude.loginError, 'erro');
    }
    retratoInicial = false;
  });
  // O navegador reconecta sozinho; o primeiro evento da nova conexão volta a ser retrato.
  fonte.onerror = () => { retratoInicial = true; };
}


// Voltar ao app depois do navegador é o momento em que o estado costuma ter mudado.
export function refreshAiOnFocus() {
  let ultimo = 0;
  const atualizar = () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - ultimo < INTERVALO_FOCO_MS) return;
    ultimo = Date.now();
    void loadAiStatus();
  };
  window.addEventListener('focus', atualizar);
  document.addEventListener('visibilitychange', atualizar);
}

function parse(data) {
  try { return JSON.parse(data); } catch { return null; }
}
