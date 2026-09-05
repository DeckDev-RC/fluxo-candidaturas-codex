const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell, utilityProcess } = require('electron');

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

  supervisor = createSupervisor({
    launch: () => utilityProcess.fork(join(__dirname, 'backend-worker.mjs'), [workspaceRoot], { cwd: workspaceRoot, stdio: 'ignore', serviceName: 'Fluxo local' }),
    onExit: () => { if (!quitting && mainWindow) { backendUrl = null; void mainWindow.loadURL(diagnosticUrl); } }
  });

  // Mínimo baixo o suficiente para 1024×768 com zoom de texto: a interface tem
  // composição de coluna única abaixo de 48rem (U8-03).
  mainWindow = new BrowserWindow({ width: 1280, height: 860, minWidth: 720, minHeight: 560, title: 'Fluxo', show: false, ...janelaBase() });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  nativeTheme.on('updated', () => { mainWindow?.setBackgroundColor(corDeFundo()); diagnosticWindow?.setBackgroundColor(corDeFundo()); });
  mainWindow.on('closed', () => { mainWindow = null; });
  protectWindow(mainWindow);
  const trusted = event => {
    const url = event.senderFrame?.url || '';
    if (event.senderFrame !== event.sender.mainFrame || !(url === diagnosticUrl || backendUrl && new URL(url).origin === backendUrl)) throw new Error('Origem não autorizada.');
  };
  ipcMain.handle('fluxo:diagnostics', async event => { trusted(event); return (await import('./diagnostics.mjs')).diagnose(); });
  ipcMain.handle('fluxo:workspace', event => { trusted(event); return { rootDir: workspaceRoot, running: Boolean(backendUrl) }; });
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
  browserInstaller?.kill();
  Promise.resolve(supervisor?.stop()).finally(() => app.quit());
});
