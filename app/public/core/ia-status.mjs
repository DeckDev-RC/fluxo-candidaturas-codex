// Acompanhamento da conexão com a IA. O login termina fora do app (navegador),
// então ninguém avisa a tela: aqui o estado é reconsultado enquanto o login
// está em curso e sempre que a janela volta ao foco.

import { loadAiStatus, store } from './store.mjs';
import { notice } from '../ui/messages.mjs';

const INTERVALO_MS = 3000;
const LIMITE_MS = 5 * 60 * 1000;
let espera = null;

// Chamado logo depois de abrir o login: consulta até a IA responder conectada.
export function watchAiLogin() {
  stopWatching();
  const inicio = Date.now();
  const verificar = async () => {
    await loadAiStatus();
    if (store.ia.disponivel) {
      stopWatching();
      notice('Automação de IA conectada. A busca automática já pode começar.', 'sucesso');
      return;
    }
    if (Date.now() - inicio >= LIMITE_MS) {
      stopWatching();
      notice('O login não foi confirmado em cinco minutos. Se você concluiu no navegador, clique em "Verificar novamente".', 'atencao');
      return;
    }
    espera = setTimeout(verificar, INTERVALO_MS);
  };
  espera = setTimeout(verificar, INTERVALO_MS);
}

export function stopWatching() {
  clearTimeout(espera);
  espera = null;
}

// Voltar ao app depois do navegador é o momento em que o estado costuma ter mudado.
export function refreshAiOnFocus() {
  let ultimo = 0;
  const atualizar = () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - ultimo < INTERVALO_MS) return;
    ultimo = Date.now();
    void loadAiStatus();
  };
  window.addEventListener('focus', atualizar);
  document.addEventListener('visibilitychange', atualizar);
}
