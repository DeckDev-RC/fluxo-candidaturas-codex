const SKYNET_ORIGIN = 'https://skynetchat.net';
const CHAT_TIMEOUT_MS = 3 * 60 * 1000;
const { buildChatScript, buildInterruptScript, normalizeChatInput } = require('./skynet-chat.cjs');

function createSkynetSession({
  BrowserWindow,
  parentWindow,
  partition = 'persist:skynet',
  origin = SKYNET_ORIGIN,
  timeoutMs = CHAT_TIMEOUT_MS,
  onStatus = () => {}
} = {}) {
  if (typeof BrowserWindow !== 'function') throw new TypeError('Skynet requer BrowserWindow.');
  let window = null;
  let destroying = false;
  let lastPublished = '';

  const api = {
    async status() {
      try {
        const target = await ensureWindow({ url: `${origin}/` });
        const value = await readStatus(target);
        if (value.authenticated) target.hide();
        return publish(value);
      } catch {
        return statusValue('unavailable', false, 'A sessão do SkynetChat não está disponível.');
      }
    },

    async startLogin() {
      const current = await api.status();
      if (current.authenticated) return current;
      await ensureWindow({ url: `${origin}/login`, show: true, force: true });
      return statusValue('awaiting_user', false, 'Digite seu código na janela segura do SkynetChat.');
    },

    async logout() {
      await api.interrupt();
      const target = await ensureWindow({ url: `${origin}/` });
      await target.webContents.session.clearStorageData({ origin });
      await target.webContents.loadURL(`${origin}/login`);
      target.hide();
      return publish(statusValue('signed_out', false, 'Sessão do SkynetChat removida.'));
    },

    async chat(input) {
      const current = await api.status();
      if (!current.authenticated) throw failure('skynet_signed_out', 'Entre no SkynetChat antes de conversar.');
      const payload = normalizeChatInput(input);
      const target = await ensureWindow({ url: `${origin}/` });
      const operation = target.webContents.executeJavaScript(buildChatScript(payload), true);
      const result = await withTimeout(operation, timeoutMs, () => api.interrupt(payload.operationId));
      const text = String(result?.text ?? '').trim();
      if (!text) throw failure('skynet_empty_response', 'O SkynetChat terminou sem devolver uma resposta.');
      return { text, conversationId: payload.conversationId, finishReason: String(result?.finishReason ?? '') };
    },

    async interrupt(operationId = '') {
      if (!alive(window)) return { interrupted: false };
      const interrupted = await window.webContents.executeJavaScript(buildInterruptScript(operationId), true).catch(() => false);
      return { interrupted: interrupted === true };
    },

    destroy() {
      destroying = true;
      const current = window;
      window = null;
      if (alive(current)) {
        try { current.destroy(); } catch { /* janela já encerrando */ }
      }
    }
  };

  return api;

  async function ensureWindow({ url, show = false, force = false }) {
    if (!alive(window)) {
      window = new BrowserWindow({
        parent: alive(parentWindow) ? parentWindow : undefined,
        width: 920,
        height: 760,
        minWidth: 640,
        minHeight: 560,
        title: 'Entrar no SkynetChat — Fluxo',
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#09090b',
        webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false }
      });
      harden(window);
    }
    const currentUrl = window.webContents.getURL?.() ?? '';
    // O Turnstile mede visibilidade desde a inicialização da página. No login,
    // a janela precisa estar visível antes de a navegação começar.
    if (show) { window.show(); window.focus(); }
    if (force || !allowed(currentUrl, origin)) await window.webContents.loadURL(url);
    if (show) window.focus();
    return window;
  }

  function harden(target) {
    target.setMenuBarVisibility?.(false);
    target.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    target.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    target.webContents.on('will-navigate', (event, url) => { if (!allowed(url, origin)) event.preventDefault(); });
    target.webContents.on('dom-ready', () => { void refreshAndPublish(target); });
    target.on('close', (event) => {
      if (destroying) return;
      event.preventDefault();
      target.hide();
    });
    target.on('closed', () => { if (window === target) window = null; });
  }

  async function refreshAndPublish(target) {
    if (!alive(target)) return;
    const value = await readStatus(target).catch(() => statusValue('unavailable', false, 'Não foi possível verificar o SkynetChat.'));
    if (value.authenticated) {
      target.hide();
      if (alive(parentWindow)) { parentWindow.show(); parentWindow.focus(); }
    }
    publish(value);
  }

  function publish(value) {
    const key = JSON.stringify(value);
    if (key !== lastPublished) {
      lastPublished = key;
      try { onStatus(value); } catch { /* observador não derruba a sessão */ }
    }
    return value;
  }
}

async function readStatus(window) {
  if (!alive(window)) return statusValue('unavailable', false, 'A janela do SkynetChat não está disponível.');
  const authenticated = await window.webContents.executeJavaScript(
    `new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const connected = [...document.querySelectorAll('button')].some((button) => /sair da conta/i.test(button.getAttribute('aria-label') || button.textContent || ''));
        const login = location.pathname === '/login' && Boolean(document.querySelector('input[name="code"]'));
        if (connected || login || Date.now() - started >= 2000) return resolve(connected);
        setTimeout(check, 100);
      };
      check();
    })`,
    true
  );
  return authenticated
    ? statusValue('authenticated', true, 'Conversa do SkynetChat conectada.')
    : statusValue('signed_out', false, 'Entre no SkynetChat para ativar a conversa.');
}

function allowed(value, origin) {
  try {
    const url = new URL(value);
    const expected = new URL(origin);
    return url.protocol === 'https:' && (url.hostname === expected.hostname || url.hostname === `www.${expected.hostname}`);
  } catch { return false; }
}

function statusValue(status, authenticated, message) {
  return { status, authenticated, provider: 'skynet', message };
}

function alive(value) {
  return Boolean(value) && !value.isDestroyed?.();
}

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

async function withTimeout(promise, timeoutMs, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      Promise.resolve(onTimeout?.()).catch(() => {});
      reject(failure('skynet_timeout', 'O SkynetChat demorou demais para responder.'));
    }, timeoutMs);
  });
  try { return await Promise.race([promise, timeout]); }
  finally { clearTimeout(timer); }
}

module.exports = { CHAT_TIMEOUT_MS, SKYNET_ORIGIN, createSkynetSession };
