// Preferência de tema: sistema, claro ou escuro. Fica neste computador e vale
// para a janela inteira. No desktop, quem diz se o sistema está escuro é o
// processo principal (nativeTheme): o prefers-color-scheme do renderer é
// alterado pelo driver do navegador ao se conectar por CDP e não é confiável.

const CHAVE = 'fluxo-tema';
export const TEMAS = [
  { id: 'sistema', rotulo: 'Seguir o sistema' },
  { id: 'claro', rotulo: 'Claro' },
  { id: 'escuro', rotulo: 'Escuro' }
];
const sistema = window.matchMedia?.('(prefers-color-scheme: dark)');
let sistemaEscuroSegundoDesktop = null;

export function getTheme() {
  const salvo = document.documentElement.dataset.tema;
  return TEMAS.some((tema) => tema.id === salvo) ? salvo : 'sistema';
}

export function setTheme(preferencia) {
  const valor = TEMAS.some((tema) => tema.id === preferencia) ? preferencia : 'sistema';
  try { window.localStorage.setItem(CHAVE, valor); } catch {}
  aplicar(valor);
  sincronizarComDesktop(valor);
}

export function startTheme() {
  aplicar(getTheme());
  // Fora do desktop, mudanças do sistema chegam pelo próprio navegador.
  sistema?.addEventListener?.('change', () => { if (!window.fluxoDesktop?.tema && getTheme() === 'sistema') aplicar('sistema'); });
  window.fluxoDesktop?.aoMudarTema?.(({ escuro }) => { sistemaEscuroSegundoDesktop = Boolean(escuro); if (getTheme() === 'sistema') aplicar('sistema'); });
  sincronizarComDesktop(getTheme());
}

function sincronizarComDesktop(preferencia) {
  const desktop = window.fluxoDesktop?.tema;
  if (!desktop) return;
  Promise.resolve(desktop(preferencia)).then((resposta) => {
    if (resposta && typeof resposta === 'object' && 'escuro' in resposta) { sistemaEscuroSegundoDesktop = Boolean(resposta.escuro); aplicar(getTheme()); }
  }).catch(() => {});
}

function aplicar(preferencia) {
  const escuroNoSistema = sistemaEscuroSegundoDesktop ?? Boolean(sistema?.matches);
  const efetivo = preferencia === 'sistema' ? (escuroNoSistema ? 'escuro' : 'claro') : preferencia;
  document.documentElement.dataset.tema = preferencia;
  document.documentElement.dataset.temaEfetivo = efetivo;
}
