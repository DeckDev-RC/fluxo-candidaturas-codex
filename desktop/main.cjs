const { app, BrowserWindow, Menu, Notification, WebContentsView, dialog, ipcMain, nativeTheme, session, shell, utilityProcess } = require('electron');

// As abas das plataformas têm sessão própria (cookies, armazenamento), separada da
// interface local do Fluxo. O Playwright, conectado por CDP, ainda as enxerga:
// páginas de contextos que ele não criou entram no contexto padrão dele.
const PARTICAO_PLATAFORMAS = 'persist:plataformas';
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

// Erro inesperado no processo principal vai para o log em userData, não para uma
// caixa nativa que derruba o app. O log é o que a pessoa envia no suporte.
const { appendFileSync, mkdirSync } = require('node:fs');
function registrarErro(origem, erro) {
  try {
    const pasta = join(app.getPath('userData'), 'logs');
    mkdirSync(pasta, { recursive: true });
    appendFileSync(join(pasta, 'principal.log'), `${new Date().toISOString()} ${origem}: ${erro?.stack ?? erro}\n`);
  } catch { /* sem onde registrar */ }
}
process.on('uncaughtException', (erro) => registrarErro('uncaughtException', erro));
process.on('unhandledRejection', (erro) => registrarErro('unhandledRejection', erro));
let mainWindow; let diagnosticWindow; let supervisor; let workspaceRoot; let backendUrl; let quitting = false; let changingWorkspace = false;
let abas; let cdpEndpoint = '';
// Última parada do serviço local, para a tela de diagnóstico explicar e oferecer reinício.
let ultimaParada = null;
const preload = join(__dirname, 'preload.cjs');
const bundleRoot = app.isPackaged ? join(process.resourcesPath, 'fluxo-runtime') : resolve(__dirname, '..');
const diagnosticUrl = pathToFileURL(join(__dirname, 'diagnostics.html')).href;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (janelaViva(mainWindow)) { mainWindow.show(); mainWindow.focus(); } });
  // No Windows, notificações nativas exigem o mesmo id do atalho instalado.
  if (process.platform === 'win32') app.setAppUserModelId('br.fluxo.desktop');
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
      // stdout/stderr do serviço vão para userData/logs/servico-saida.log: sem isso, um
      // crash do backend não deixa rastro nenhum para investigar.
      const worker = utilityProcess.fork(join(__dirname, 'backend-worker.mjs'), [workspaceRoot, cdpEndpoint], { cwd: workspaceRoot, stdio: ['ignore', 'pipe', 'pipe'], serviceName: 'Fluxo local' });
      for (const fluxo of [worker.stdout, worker.stderr]) fluxo?.on('data', (pedaco) => registrarSaidaDoServico(pedaco));
      worker.on('message', (mensagem) => { if (mensagem?.type === 'abas') void atenderWorker(worker, mensagem); });
      worker.on('error', (erro) => registrarErro('serviço local', erro));
      return worker;
    },
    onExit: (code) => {
      registrarErro('serviço local encerrou', `código ${code}`);
      ultimaParada = { code, at: new Date().toISOString(), motivo: `O serviço local parou de forma inesperada (código ${code}).` };
      abas?.fecharTodas();
      if (!quitting && janelaViva(mainWindow)) { backendUrl = null; mainWindow.loadURL(diagnosticUrl).catch(() => {}); }
    }
  });
  // Permissões (câmera, localização, notificações) negadas também na sessão das plataformas.
  session.fromPartition(PARTICAO_PLATAFORMAS).setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

  // Mínimo baixo o suficiente para 1024×768 com zoom de texto: a interface tem
  // composição de coluna única abaixo de 48rem (U8-03).
  mainWindow = new BrowserWindow({ width: 1280, height: 860, minWidth: 720, minHeight: 560, title: 'Fluxo', show: false, ...janelaBase() });
  mainWindow.once('ready-to-show', () => { if (janelaViva(mainWindow)) mainWindow.show(); });
  nativeTheme.on('updated', () => { for (const janela of [mainWindow, diagnosticWindow]) if (janela && !janela.isDestroyed()) janela.setBackgroundColor(corDeFundo()); });
  // As abas fecham com a janela, enquanto ela ainda existe; depois disso nada toca nela.
  mainWindow.on('close', () => { abas?.destruir(); });
  mainWindow.on('closed', () => { mainWindow = null; abas = null; });
  protectWindow(mainWindow);
  abas = createAbas({
    window: mainWindow,
    // disableDialogs: alert/confirm/prompt da plataforma não viram janela nativa do
    // sistema sobre o app (ex.: pedido de localização do InfoJobs); a página segue.
    criarView: ({ zoomFactor = 1 } = {}) => new WebContentsView({ webPreferences: { partition: PARTICAO_PLATAFORMAS, sandbox: true, contextIsolation: true, nodeIntegration: false, disableDialogs: true, zoomFactor } }),
    aoMudar: (lista) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('fluxo:abas-mudou', lista); }
  });
  // Ao trocar a página da janela (diagnóstico, nova pasta), nenhuma aba pode ficar sobre ela.
  mainWindow.webContents.on('did-start-navigation', (event) => { if (event.isMainFrame) abas?.definirArea(null); });
  const trusted = event => {
    const url = event.senderFrame?.url || '';
    if (event.senderFrame !== event.sender.mainFrame || !(url === diagnosticUrl || backendUrl && new URL(url).origin === backendUrl)) throw new Error('Origem não autorizada.');
  };
  ipcMain.handle('fluxo:diagnostics', async event => { trusted(event); return (await import('./diagnostics.mjs')).diagnose(); });
  ipcMain.handle('fluxo:workspace', event => { trusted(event); return { rootDir: workspaceRoot, running: Boolean(backendUrl), embutido: Boolean(cdpEndpoint), ultimaParada }; });
  // Reinício do serviço pela tela de diagnóstico, sem fechar o app.
  ipcMain.handle('fluxo:restart-backend', async event => {
    trusted(event);
    if (quitting) throw new Error('O Fluxo está encerrando.');
    if (changingWorkspace) throw new Error('Aguarde a troca de pasta em andamento.');
    await supervisor.stop();
    backendUrl = (await supervisor.start()).url;
    ultimaParada = null;
    await carregarNaJanela(backendUrl);
    return { running: true };
  });
  // O tema efetivo vem do processo principal: o renderer não pode confiar em
  // prefers-color-scheme, que o driver do navegador (CDP) altera ao se conectar.
  ipcMain.handle('fluxo:tema', (event, preferencia) => {
    trusted(event);
    nativeTheme.themeSource = { claro: 'light', escuro: 'dark' }[String(preferencia)] ?? 'system';
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBackgroundColor(corDeFundo());
    return { themeSource: nativeTheme.themeSource, escuro: nativeTheme.shouldUseDarkColors };
  });
  nativeTheme.on('updated', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('fluxo:tema-mudou', { escuro: nativeTheme.shouldUseDarkColors }); });
  // Aviso do sistema quando a pessoa está em outro lugar: notificação nativa e
  // barra de tarefas piscando; clicar traz a janela de volta. Texto vem da interface.
  ipcMain.handle('fluxo:notificar', (event, aviso) => {
    trusted(event);
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFocused()) return false;
    const titulo = String(aviso?.titulo ?? 'Fluxo').slice(0, 80);
    const corpo = String(aviso?.corpo ?? '').slice(0, 240);
    mainWindow.flashFrame(true);
    mainWindow.once('focus', () => mainWindow?.flashFrame(false));
    if (Notification.isSupported()) {
      const notificacao = new Notification({ title: titulo, body: corpo, silent: false });
      notificacao.on('click', () => { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); } });
      notificacao.show();
    }
    return true;
  });
  // O renderer mede em pixels CSS; a view é posicionada em pixels da janela.
  // Com zoom da página (Ctrl + / Ctrl -) as duas escalas divergem: o fator vem daqui.
  ipcMain.handle('fluxo:abas-area', (event, retangulo) => {
    trusted(event);
    if (!retangulo || typeof retangulo !== 'object') { abas?.definirArea(null); return true; }
    const zoom = event.sender.getZoomFactor?.() || 1;
    abas?.definirArea({ x: Number(retangulo.x) * zoom, y: Number(retangulo.y) * zoom, width: Number(retangulo.width) * zoom, height: Number(retangulo.height) * zoom });
    return true;
  });
  ipcMain.handle('fluxo:abas-mostrar', (event, platform) => { trusted(event); return abas?.mostrar(plataformaValida(platform)) ?? false; });
  ipcMain.handle('fluxo:abas-esconder', (event) => { trusted(event); abas?.esconder(); return true; });
  ipcMain.handle('fluxo:abas-listar', (event) => { trusted(event); return abas?.listar() ?? []; });
  // Controles manuais da aba visível: voltar, recarregar, abrir a URL atual no navegador do sistema.
  ipcMain.handle('fluxo:abas-voltar', (event, platform) => { trusted(event); return abas?.voltar(platform) ?? false; });
  ipcMain.handle('fluxo:abas-zoom', (event, fator) => { trusted(event); return abas?.definirZoom(fator) ?? 1; });
  ipcMain.handle('fluxo:abas-recarregar', (event, platform) => { trusted(event); return abas?.recarregar(platform) ?? false; });
  ipcMain.handle('fluxo:abas-abrir-externa', async (event, platform) => {
    trusted(event);
    const url = abas?.urlAtual(platform) ?? '';
    if (!url) return false;
    await shell.openExternal(url);
    return true;
  });
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
  try { backendUrl = (await supervisor.start()).url; await carregarNaJanela(backendUrl); }
  catch (error) { registrarErro('início do serviço', error); await carregarNaJanela(diagnosticUrl); }
}

// Navegar a janela principal só enquanto ela existe.
async function carregarNaJanela(url) {
  if (!janelaViva(mainWindow)) return;
  await mainWindow.loadURL(url).catch((error) => registrarErro('carregar janela', error));
}

async function selectWorkspace(preferencesPath) {
  if (changingWorkspace) throw new Error('Aguarde a troca de pasta em andamento.');
  if (quitting) throw new Error('O Fluxo está encerrando.');
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Escolha a pasta de dados do Fluxo', properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled) return { canceled: true };
  changingWorkspace = true;
  const previousRoot = workspaceRoot;
  try {
    const rootDir = result.filePaths[0];
    await (await import('./workspace.mjs')).initializeWorkspace({ rootDir, bundleRoot });
    abas?.fecharTodas();
    await supervisor.stop(); backendUrl = null; workspaceRoot = rootDir;
    if (quitting) return { canceled: true };
    backendUrl = (await supervisor.start()).url;
    await writeFile(preferencesPath, JSON.stringify({ rootDir }, null, 2), 'utf8');
    await carregarNaJanela(backendUrl);
    return { rootDir };
  } catch (error) {
    // Volta para a pasta anterior; se nem ela subir, a janela mostra o diagnóstico com o motivo.
    workspaceRoot = previousRoot;
    await supervisor.stop();
    if (!quitting) {
      try { backendUrl = (await supervisor.start()).url; await carregarNaJanela(backendUrl); }
      catch (segundoErro) { registrarErro('voltar à pasta anterior', segundoErro); backendUrl = null; await carregarNaJanela(diagnosticUrl); }
    }
    throw error;
  } finally { changingWorkspace = false; }
}

function showDiagnostics() {
  if (diagnosticWindow) { diagnosticWindow.focus(); return; }
  diagnosticWindow = new BrowserWindow({ parent: mainWindow, width: 760, height: 620, minWidth: 560, minHeight: 480, title: 'Preparação do ambiente — Fluxo', ...janelaBase() });
  protectWindow(diagnosticWindow); diagnosticWindow.on('closed', () => { diagnosticWindow = null; });
  diagnosticWindow.loadURL(diagnosticUrl).catch((error) => registrarErro('carregar diagnóstico', error));
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
  const { id, op, url } = mensagem;
  const platform = plataformaValida(mensagem.platform);
  const responder = (ok, result, error) => { try { worker.postMessage({ type: 'abas-resposta', id, ok, result, error }); } catch { /* worker já encerrou */ } };
  try {
    if (!abas || !janelaViva(mainWindow)) throw new Error('A janela do Fluxo não está disponível.');
    if (op === 'abrir') {
      if (!platform) throw new Error('Plataforma inválida.');
      if (!/^https?:\/\//i.test(String(url ?? ''))) throw new Error('URL de aba inválida.');
      return responder(true, await abas.abrir(platform, url));
    }
    if (op === 'mostrar') return responder(true, abas.mostrar(platform));
    if (op === 'esconder') { abas.esconder(); return responder(true, true); }
    if (op === 'listar') return responder(true, abas.listar());
    throw new Error(`Operação desconhecida: ${op}`);
  } catch (error) { responder(false, null, error.message); }
}

// O Chromium grava a porta escolhida em DevToolsActivePort logo após iniciar. Um
// arquivo antigo (de um processo que caiu) pode sobreviver: a porta só vale se
// responder ao /json/version deste processo.
async function lerEndpointDeDepuracao(userData, tentativas = 20) {
  if (process.env.FLUXO_DESKTOP_SEM_NAVEGADOR_EMBUTIDO) return '';
  for (let i = 0; i < tentativas; i += 1) {
    try {
      const [porta] = (await readFile(join(userData, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/);
      if (Number(porta) > 0) {
        const endpoint = `http://127.0.0.1:${Number(porta)}`;
        const resposta = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1_000) }).then((r) => r.ok ? r.json() : null).catch(() => null);
        if (resposta?.webSocketDebuggerUrl) return endpoint;
      }
    } catch { /* ainda não escrito */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  registrarErro('navegador embutido', 'porta de depuração indisponível; usando navegador separado');
  return '';
}

// Nomes de plataforma vêm do worker e da interface: só o alfabeto do catálogo passa.
function plataformaValida(valor) {
  const nome = String(valor ?? '').toUpperCase();
  return /^[A-Z0-9_-]{1,32}$/.test(nome) ? nome : '';
}

function janelaViva(janela) { return Boolean(janela) && !janela.isDestroyed(); }

let saidaDoServico = '';
function registrarSaidaDoServico(pedaco) {
  saidaDoServico += String(pedaco);
  if (saidaDoServico.length < 4_096 && !saidaDoServico.includes('\n')) return;
  const texto = saidaDoServico; saidaDoServico = '';
  try { const pasta = join(app.getPath('userData'), 'logs'); mkdirSync(pasta, { recursive: true }); appendFileSync(join(pasta, 'servico-saida.log'), texto); } catch { /* sem onde registrar */ }
}

function protectWindow(window) {
  window.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url).catch(() => {}); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => {
    let origem = '';
    try { origem = new URL(url).origin; } catch { event.preventDefault(); return; }
    if (url !== diagnosticUrl && (!backendUrl || origem !== backendUrl)) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}
// Caixa de mensagem assíncrona: a síncrona bloqueia o processo principal e faz
// os pedidos do serviço (abrir aba) expirarem enquanto a pessoa lê.
function showError(error) {
  registrarErro('erro exibido', error);
  const opcoes = { type: 'error', title: 'Fluxo', message: String(error?.message ?? error), buttons: ['OK'] };
  (janelaViva(mainWindow) ? dialog.showMessageBox(mainWindow, opcoes) : dialog.showMessageBox(opcoes)).catch(() => {});
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true;
  abas?.destruir();
  browserInstaller?.kill();
  // O serviço tem tempo para fechar o banco; passe o que passar, o app sai.
  Promise.race([Promise.resolve(supervisor?.stop()).catch((error) => registrarErro('parar serviço', error)), new Promise((resolve) => setTimeout(resolve, 12_000))]).finally(() => app.quit());
});
