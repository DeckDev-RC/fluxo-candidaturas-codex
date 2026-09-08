// Tema do Fluxo: preferência da pessoa (claro, escuro ou sistema), aplicada
// antes da primeira pintura para não piscar. Carregado como script comum no
// <head>; o resto do app lê e altera pela mesma chave (core/tema.mjs).
(function () {
  var CHAVE = 'fluxo-tema';
  var preferencia = 'sistema';
  try { preferencia = window.localStorage.getItem(CHAVE) || 'sistema'; } catch (erro) { /* sem armazenamento: segue o sistema */ }
  if (preferencia !== 'claro' && preferencia !== 'escuro') preferencia = 'sistema';
  var escuroNoSistema = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var efetivo = preferencia === 'sistema' ? (escuroNoSistema ? 'escuro' : 'claro') : preferencia;
  document.documentElement.dataset.tema = preferencia;
  document.documentElement.dataset.temaEfetivo = efetivo;
})();
