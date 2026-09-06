const { app, BrowserWindow, Menu, WebContentsView, dialog, ipcMain, nativeTheme, shell, utilityProcess } = require('electron');
const { createAbas } = require('./abas.cjs');

// A IA opera as plataformas em abas dentro desta janela: o backend liga o
// Playwright ao Chromium do próprio Electron pela porta de depuração local
// (aleatória, só loopback, viva enquanto o app roda). Sem a porta, o app segue
// com o navegador separado.
if (!process.env.FLUXO_DESKTOP_SEM_NAVEGADOR_EMBUTIDO) app.commandLine.appendSwitch('remote-debugging-port', '0');

// Mesma cor de fundo dos tokens da interface (--fundo), para a janela não piscar
// em branco antes de carregar e acompanhar o tema do sistema. A barra de menu
// nativa fica escondida (Alt mostra): os itens continuam no atalho de teclado.
const corDeFundo = () => (nativeTheme.shouldUseDarkColors ? '#09090b' : '#fafafa');
const janelaBase = () => ({ backgroundColor: corDeFundo(), autoHideMenuBar: true, webPreferences: { preload, nodeIntegration: false, contextIsolation: true, sandbox: true } });
const { join, resolve, dirname } = require('node:path');
const { pathToFileURL } = require('node:url');
const { readFile, writeFile, mkdir } = require('node:fs/promises');

if (process.env.FLUXO_DESKTOP_USER_DATA) app.setPath('userData', resolve(process.env.FLUXO_DESKTOP_USER_DATA));
let mainWindow; let diagnosticWindow; let supervisor; let workspaceRoot; let backendUrl; let quitting = false; let changingWorkspace = false;
let abas; let cdpEndpoint = '';
const preload = join(__dirname, 'preload.cjs');
const bundleRoot = app.isPackaged ? join(process.resourcesPath, 'fluxo-runtime') : resolve(__dirname, '..');
const diagnosticUrl = pathToFileURL(join(__dirname, 'diagnostics.html')).href;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });
  app.whenReady().then(start).catch(error => { dialog.showErrorBox('Fluxo', error.message); app.quit(); });
}

async function start() {
  const { createSupervisor } = await import('./supervisor.mjs');
  const { initializeWorkspace } = await import('./workspace.mjs');
  await mkdir(app.getPath('userData'), { recursive: true });
  const preferencesPath = join(app.getPath('userData'), 'workspace.json');
  let preferences = {};
  try { preferences = JSON.parse(await readFile(preferencesPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('A configuração da pasta local está inválida. Preserve o arquivo workspace.json para diagnóstico.'); }
  workspaceRoot = process.env.FLUXO_DESKTOP_ROOT || preferences.rootDir || join(app.getPath('userData'), 'workspace');
  await initializeWorkspace({ rootDir: workspaceRoot, bundleRoot });

  cdpEndpoint = await lerEndpointDeDepuracao(app.getPath('userData'));
  supervisor = createSupervisor({
    launch: () => {
      const worker = utilityProcess.fork(join(__dirname, 'backend-worker.mjs'), [workspaceRoot, cdpEndpoint], { cwd: workspaceRoot, stdio: 'ignore', serviceName: 'Fluxo local' });
      worker.on('message', (mensagem) => { if (mensagem?.type === 'abas') void atenderWorker(worker, mensagem); });
      return worker;
    },
    onExit: () => { abas?.fecharTodas(); if (!quitting && mainWindow) { backendUrl = null; void mainWindow.loadURL(diagnosticUrl); } }
  });

  // Mínimo baixo o suficiente para 1024×768 com zoom de texto: a interface tem
  // composição de coluna única abaixo de 48rem (U8-03).
  mainWindow = new BrowserWindow({ width: 1280, height: 860, minWidth: 720, minHeight: 560, title: 'Fluxo', show: false, ...janelaBase() });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  nativeTheme.on('updated', () => { mainWindow?.setBackgroundColor(corDeFundo()); diagnosticWindow?.setBackgroundColor(corDeFundo()); });
  mainWindow.on('closed', () => { mainWindow = null; });
  protectWindow(mainWindow);
  abas = createAbas({
    window: mainWindow,
    criarView: () => new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } }),
    aoMudar: (lista) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('fluxo:abas-mudou', lista); }
  });
  // Ao trocar a página da janela (diagnóstico, nova pasta), nenhuma aba pode ficar sobre ela.
  mainWindow.webContents.on('did-start-navigation', (event) => { if (event.isMainFrame) abas.definirArea(null); });
  const trusted = event => {
    const url = event.senderFrame?.url || '';
    if (event.senderFrame !== event.sender.mainFrame || !(url === diagnosticUrl || backendUrl && new URL(url).origin === backendUrl)) throw new Error('Origem não autorizada.');
  };
  ipcMain.handle('fluxo:diagnostics', async event => { trusted(event); return (await import('./diagnostics.mjs')).diagnose(); });
  ipcMain.handle('fluxo:workspace', event => { trusted(event); return { rootDir: workspaceRoot, running: Boolean(backendUrl), embutido: Boolean(cdpEndpoint) }; });
  ipcMain.handle('fluxo:abas-area', (event, retangulo) => { trusted(event); abas.definirArea(retangulo && typeof retangulo === 'object' ? retangulo : null); return true; });
  ipcMain.handle('fluxo:abas-mostrar', (event, platform) => { trusted(event); return abas.mostrar(String(platform ?? '')); });
  ipcMain.handle('fluxo:abas-esconder', (event) => { trusted(event); abas.esconder(); return true; });
  ipcMain.handle('fluxo:abas-listar', (event) => { trusted(event); return abas.listar(); });
  ipcMain.handle('fluxo:select-workspace', async event => { trusted(event); return selectWorkspace(preferencesPath); });
  ipcMain.handle('fluxo:install-browser', async event => { trusted(event); return installBrowser(); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Fluxo', submenu: [
      { label: 'Escolher pasta de dados…', click: () => selectWorkspace(preferencesPath).catch(showError) },
      { label: 'Diagnóstico e instalação', click: showDiagnostics },
      { label: 'Instalar navegador', click: () => installBrowser().then(showDiagnostics).catch(showError) },
      { type: 'separator' }, { role: 'quit', label: 'Sair' }
    ] },
    { label: 'Editar', submenu: [{ role: 'undo', label: 'Desfazer' }, { role: 'redo', label: 'Refazer' }, { type: 'separator' }, { role: 'cut', label: 'Recortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' }] },
    { label: 'Exibir', submenu: [{ role: 'reload', label: 'Recarregar' }, { role: 'resetZoom', label: 'Zoom original' }, { role: 'zoomIn', label: 'Ampliar' }, { role: 'zoomOut', label: 'Reduzir' }] }
  ]));
  try { backendUrl = (await supervisor.start()).url; await mainWindow.loadURL(backendUrl); }
  catch { await mainWindow.loadURL(diagnosticUrl); }
}

async function selectWorkspace(preferencesPath) {
  if (changingWorkspace) throw new Error('Aguarde a troca de pasta em andamento.');
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Escolha a pasta de dados do Fluxo', properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled) return { canceled: true };
  changingWorkspace = true;
  const previousRoot = workspaceRoot;
  try {
    const rootDir = result.filePaths[0];
    await (await import('./workspace.mjs')).initializeWorkspace({ rootDir, bundleRoot });
    abas?.fecharTodas();
    await supervisor.stop(); backendUrl = null; workspaceRoot = rootDir;
    backendUrl = (await supervisor.start()).url;
    await writeFile(preferencesPath, JSON.stringify({ rootDir }, null, 2), 'utf8');
    await mainWindow.loadURL(backendUrl);
    return { rootDir };
  } catch (error) {
    workspaceRoot = previousRoot;
    await supervisor.stop(); backendUrl = (await supervisor.start()).url;
    await mainWindow.loadURL(backendUrl); throw error;
  } finally { changingWorkspace = false; }
}

function showDiagnostics() {
  if (diagnosticWindow) { diagnosticWindow.focus(); return; }
  diagnosticWindow = new BrowserWindow({ parent: mainWindow, width: 760, height: 620, minWidth: 560, minHeight: 480, title: 'Preparação do ambiente — Fluxo', ...janelaBase() });
  protectWindow(diagnosticWindow); diagnosticWindow.on('closed', () => { diagnosticWindow = null; });
  void diagnosticWindow.loadURL(diagnosticUrl);
}

let browserInstall; let browserInstaller;
function installBrowser() {
  if (browserInstall) return browserInstall;
  browserInstall = new Promise((resolve, reject) => {
    const child = utilityProcess.fork(join(__dirname, 'install-browser.cjs'), [], { stdio: 'ignore', serviceName: 'Instalação do navegador Fluxo' });
    browserInstaller = child;
    const timer = setTimeout(() => { child.kill(); reject(new Error('A instalação excedeu dez minutos. Verifique sua conexão.')); }, 600_000);
    child.once('exit', code => { clearTimeout(timer); if (code === 0) resolve({ installed: true }); else reject(new Error('Não foi possível instalar Chromium. Verifique a conexão e tente novamente.')); });
  }).finally(() => { browserInstall = null; browserInstaller = null; });
  return browserInstall;
}

// O worker pede abrir/mostrar/listar abas; a URL de abertura precisa ser local
// (marcadora do backend) ou https, nunca outro esquema.
async function atenderWorker(worker, mensagem) {
  const { id, op, platform, url } = mensagem;
  const responder = (ok, result, error) => { try { worker.postMessage({ type: 'abas-resposta', id, ok, result, error }); } catch { /* worker já encerrou */ } };
  try {
    if (!abas) throw new Error('Janela ainda não está pronta.');
    if (op === 'abrir') {
      if (!/^https?:\/\//i.test(String(url ?? ''))) throw new Error('URL de aba inválida.');
      return responder(true, await abas.abrir(platform, url));
    }
    if (op === 'mostrar') return responder(true, abas.mostrar(platform));
    if (op === 'esconder') { abas.esconder(); return responder(true, true); }
    if (op === 'listar') return responder(true, abas.listar());
    throw new Error(`Operação desconhecida: ${op}`);
  } catch (error) { responder(false, null, error.message); }
}

// O Chromium grava a porta escolhida em DevToolsActivePort logo após iniciar.
async function lerEndpointDeDepuracao(userData, tentativas = 20) {
  if (process.env.FLUXO_DESKTOP_SEM_NAVEGADOR_EMBUTIDO) return '';
  for (let i = 0; i < tentativas; i += 1) {
    try {
      const [porta] = (await readFile(join(userData, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/);
      if (Number(porta) > 0) return `http://127.0.0.1:${Number(porta)}`;
    } catch { /* ainda não escrito */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return '';
}

function protectWindow(window) {
  window.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== diagnosticUrl && (!backendUrl || new URL(url).origin !== backendUrl)) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}
function showError(error) { dialog.showErrorBox('Fluxo', error.message); }
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true;
  abas?.fecharTodas();
  browserInstaller?.kill();
  Promise.resolve(supervisor?.stop()).finally(() => app.quit());
});
