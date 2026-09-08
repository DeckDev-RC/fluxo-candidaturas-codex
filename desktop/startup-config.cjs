function embeddedBrowserEnabled({ env = process.env } = {}) {
  return !env.FLUXO_DESKTOP_SEM_NAVEGADOR_EMBUTIDO;
}

module.exports = { embeddedBrowserEnabled };
