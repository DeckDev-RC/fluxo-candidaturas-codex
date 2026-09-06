// Preferência de tema: sistema, claro ou escuro. Fica neste computador e vale
// para a janela inteira; no desktop, o processo principal acompanha para a cor
// de fundo nativa e os controles do sistema seguirem o mesmo tema.

const CHAVE = 'fluxo-tema';
export const TEMAS = [
  { id: 'sistema', rotulo: 'Seguir o sistema' },
  { id: 'claro', rotulo: 'Claro' },
  { id: 'escuro', rotulo: 'Escuro' }
];
const sistema = window.matchMedia?.('(prefers-color-scheme: dark)');

export function getTheme() {
  const salvo = document.documentElement.dataset.tema;
  return TEMAS.some((tema) => tema.id === salvo) ? salvo : 'sistema';
}

export function setTheme(preferencia) {
  const valor = TEMAS.some((tema) => tema.id === preferencia) ? preferencia : 'sistema';
  try { window.localStorage.setItem(CHAVE, valor); } catch {}
  aplicar(valor);
  window.fluxoDesktop?.tema?.(valor).catch?.(() => {});
}

// Quando a preferência é "sistema", mudanças do sistema continuam valendo.
export function startTheme() {
  aplicar(getTheme());
  sistema?.addEventListener?.('change', () => { if (getTheme() === 'sistema') aplicar('sistema'); });
  window.fluxoDesktop?.tema?.(getTheme()).catch?.(() => {});
}

function aplicar(preferencia) {
  const efetivo = preferencia === 'sistema' ? (sistema?.matches ? 'escuro' : 'claro') : preferencia;
  document.documentElement.dataset.tema = preferencia;
  document.documentElement.dataset.temaEfetivo = efetivo;
}
