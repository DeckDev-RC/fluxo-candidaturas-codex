const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fluxoDesktop', Object.freeze({
  diagnostics: () => ipcRenderer.invoke('fluxo:diagnostics'),
  selectWorkspace: () => ipcRenderer.invoke('fluxo:select-workspace'),
  installBrowser: () => ipcRenderer.invoke('fluxo:install-browser'),
  workspace: () => ipcRenderer.invoke('fluxo:workspace'),
  // Abas das plataformas embutidas na janela: a interface diz onde e qual mostrar.
  abas: Object.freeze({
    area: (retangulo) => ipcRenderer.invoke('fluxo:abas-area', retangulo),
    mostrar: (platform) => ipcRenderer.invoke('fluxo:abas-mostrar', platform),
    esconder: () => ipcRenderer.invoke('fluxo:abas-esconder'),
    listar: () => ipcRenderer.invoke('fluxo:abas-listar'),
    aoMudar: (callback) => {
      const ouvinte = (_evento, abas) => callback(abas);
      ipcRenderer.on('fluxo:abas-mudou', ouvinte);
      return () => ipcRenderer.removeListener('fluxo:abas-mudou', ouvinte);
    }
  })
}));
