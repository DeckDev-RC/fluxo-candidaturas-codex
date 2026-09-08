const { spawn: spawnProcess } = require('node:child_process');
const { join } = require('node:path');

function createSkynetBridge({
  app,
  spawn = spawnProcess,
  onStatus = () => {},
  onLog = () => {},
  startupTimeoutMs = 20_000,
  stopTimeoutMs = 5_000
} = {}) {
  let child = null;
  let starting = null;
  let ready = false;
  let stopping = false;
  let stopPromise = null;
  let sequence = 0;
  const pending = new Map();

  const api = {
    status: () => request('status'),
    startLogin: () => request('login', {}, 30_000),
    logout: () => request('logout', {}, 30_000),
    chat: (input) => request('chat', { input }, 4 * 60_000),
    interrupt: (operationId = '') => request('interrupt', { operationId }),
    stop,
    destroy() { void stop(); }
  };
  return api;

  async function start() {
    if (stopping) throw failure('skynet_helper_stopping', 'O processo do SkynetChat está encerrando.');
    if (child && ready) return child;
    if (starting) return starting;
    stopping = false;
    stopPromise = null;
    starting = new Promise((resolve, reject) => {
      const helperUserData = join(app.getPath('userData'), 'skynet-isolated');
      const env = {
        ...process.env,
        FLUXO_SKYNET_HELPER: '1',
        FLUXO_SKYNET_USER_DATA: helperUserData,
        FLUXO_DESKTOP_USER_DATA: helperUserData
      };
      delete env.ELECTRON_RUN_AS_NODE;
      delete env.FLUXO_DESKTOP_ROOT;
      const args = app.isPackaged ? [] : [app.getAppPath()];
      const current = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
      child = current;
      let startSettled = false;
      const timer = setTimeout(() => {
        if (child === current) current.kill();
        finishStart(failure('skynet_helper_timeout', 'O processo do SkynetChat demorou para iniciar.'));
      }, startupTimeoutMs);
      const finishStart = (error = null) => {
        if (startSettled) return;
        startSettled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else { ready = true; resolve(current); }
      };
      current.on('message', (message) => {
        if (child !== current) return;
        if (message?.type === 'ready') { finishStart(); return; }
        handleMessage(message);
      });
      for (const stream of [current.stdout, current.stderr]) stream?.on('data', (chunk) => {
        try { onLog(String(chunk).slice(0, 2_000)); } catch { /* log não derruba helper */ }
      });
      current.once('error', (error) => finishStart(failure('skynet_helper_unavailable', `Não foi possível iniciar o SkynetChat: ${error.message}`)));
      current.once('exit', () => {
        if (child !== current) return;
        const wasReady = ready;
        if (!wasReady) finishStart(failure('skynet_helper_closed', 'O processo do SkynetChat encerrou durante a inicialização.'));
        child = null; ready = false; starting = null;
        rejectPending(failure('skynet_helper_closed', 'O processo do SkynetChat foi encerrado.'));
        if (!stopping && wasReady) {
          try { onStatus({ status: 'unavailable', authenticated: false, provider: 'skynet', message: 'A janela do SkynetChat foi encerrada.' }); } catch {}
        }
      });
    }).catch((error) => { starting = null; throw error; });
    return starting;
  }

  async function request(op, payload = {}, timeoutMs = 15_000) {
    const active = await start();
    const id = `skynet-helper-${++sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(failure('skynet_bridge_timeout', 'O processo do SkynetChat não respondeu no prazo.'));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      active.send({ type: 'skynet', id, op, ...payload }, (error) => {
        if (!error) return;
        const item = pending.get(id);
        if (!item) return;
        pending.delete(id);
        clearTimeout(item.timer);
        item.reject(failure('skynet_bridge_failed', 'Não foi possível falar com o processo do SkynetChat.'));
      });
    });
  }

  function handleMessage(message) {
    if (message?.type === 'skynet-event' && message.event === 'status') {
      try { onStatus(message.status); } catch { /* observador não derruba bridge */ }
      return;
    }
    if (message?.type !== 'skynet-response') return;
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    clearTimeout(item.timer);
    if (message.ok) item.resolve(message.result);
    else item.reject(failure(message.error?.code ?? 'skynet_failed', message.error?.message ?? 'Falha no SkynetChat.'));
  }

  function stop() {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      stopping = true;
      const active = child;
      if (!active) return;
      await new Promise((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        const timer = setTimeout(() => { active.kill(); setTimeout(finish, 1_000); }, stopTimeoutMs);
        active.once('exit', () => { clearTimeout(timer); finish(); });
        try { active.send({ type: 'skynet', id: `shutdown-${++sequence}`, op: 'shutdown' }); }
        catch { active.kill(); }
      });
      if (child === active) { child = null; ready = false; starting = null; }
    })();
    return stopPromise;
  }

  function rejectPending(error) {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
    pending.clear();
  }
}

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { createSkynetBridge };
