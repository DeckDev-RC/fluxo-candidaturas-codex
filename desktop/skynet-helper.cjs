const { resolve } = require('node:path');
const { createSkynetSession } = require('./skynet-session.cjs');

async function startSkynetHelper({ app, BrowserWindow } = {}) {
  const userData = process.env.FLUXO_SKYNET_USER_DATA;
  if (userData) app.setPath('userData', resolve(userData));
  let closing = false;
  let session = null;
  process.once('disconnect', () => { void shutdown(); });
  await app.whenReady();
  if (!process.connected) { await shutdown(); return; }

  session = createSkynetSession({
    BrowserWindow,
    partition: 'persist:skynet',
    onStatus: (status) => send({ type: 'skynet-event', event: 'status', status })
  });

  process.on('message', (message) => { void handle(message); });
  app.on('before-quit', () => { closing = true; session?.destroy(); });
  send({ type: 'ready' });

  async function handle(message) {
    if (!message || message.type !== 'skynet' || !message.id) return;
    try {
      const result = await operation(message);
      send({ type: 'skynet-response', id: message.id, ok: true, result });
    } catch (error) {
      send({ type: 'skynet-response', id: message.id, ok: false, error: { code: error?.code ?? 'skynet_failed', message: error?.message ?? 'Falha no SkynetChat.' } });
    }
  }

  function operation(message) {
    if (message.op === 'status') return session.status();
    if (message.op === 'login') return session.startLogin();
    if (message.op === 'logout') return session.logout();
    if (message.op === 'chat') return session.chat(message.input);
    if (message.op === 'interrupt') return session.interrupt(message.operationId);
    if (message.op === 'shutdown') return shutdown();
    throw Object.assign(new Error(`Operação desconhecida do SkynetChat: ${message.op}`), { code: 'skynet_operation_unknown' });
  }

  async function shutdown() {
    if (closing) return { stopped: true };
    closing = true;
    session?.destroy();
    setImmediate(() => app.quit());
    return { stopped: true };
  }
}

function send(message) {
  try { process.send?.(message); } catch { /* processo principal já encerrou */ }
}

module.exports = { startSkynetHelper };
