const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fluxoDesktop', Object.freeze({
  diagnostics: () => ipcRenderer.invoke('fluxo:diagnostics'),
  selectWorkspace: () => ipcRenderer.invoke('fluxo:select-workspace'),
  installBrowser: () => ipcRenderer.invoke('fluxo:install-browser'),
  workspace: () => ipcRenderer.invoke('fluxo:workspace')
}));
