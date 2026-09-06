// Aviso fora da janela: quando a pessoa está em outra aba/app e o Fluxo precisa
// dela (login, aprovação, erro). No desktop, a notificação é do sistema e a
// barra de tarefas pisca; no navegador, usa a Notification API se permitida.
// Com a janela em foco, nada é disparado: a conversa já mostra.

const INTERVALO_MINIMO_MS = 8_000;
let ultimo = 0;

export function notificarFora({ titulo, corpo }) {
  if (document.hasFocus() && document.visibilityState === 'visible') return false;
  const agora = Date.now();
  if (agora - ultimo < INTERVALO_MINIMO_MS) return false;
  ultimo = agora;
  const ponte = window.fluxoDesktop?.notificar;
  if (ponte) { ponte({ titulo, corpo }); return true; }
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') { try { new Notification(titulo, { body: corpo, silent: false }); return true; } catch { return false; } }
  if (Notification.permission === 'default') Notification.requestPermission().catch(() => null);
  return false;
}
