import { createRuntimeServer } from '../app/src/runtime-server.mjs';

// O processo principal informa o endpoint de depuração do Chromium do Electron.
// Com ele, o navegador das plataformas são abas dentro da janela; sem ele, o
// Playwright lança o Chromium separado, como antes.
const [, , rootDir, cdpEndpoint = ''] = process.argv;
let backend;
let backendUrl = '';

const pendentes = new Map();
let proximoId = 0;
function pedirAoPrincipal(op, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = `abas-${++proximoId}`;
    const prazo = setTimeout(() => { pendentes.delete(id); reject(new Error('A janela não respondeu ao pedido de aba.')); }, 15_000);
    pendentes.set(id, { resolve, reject, prazo });
    process.parentPort.postMessage({ type: 'abas', id, op, ...payload });
  });
}

const browserHost = cdpEndpoint
  ? {
    cdpEndpoint,
    markerUrl: (platform) => `${backendUrl}/aba/${encodeURIComponent(String(platform).toUpperCase())}`,
    openTab: (platform, url) => pedirAoPrincipal('abrir', { platform, url }),
    showTab: (platform) => pedirAoPrincipal('mostrar', { platform }),
    hideTab: () => pedirAoPrincipal('esconder'),
    listTabs: () => pedirAoPrincipal('listar')
  }
  : null;

try {
  backend = await createRuntimeServer({ rootDir, port: 0, browserHost });
  await new Promise((resolve, reject) => { backend.server.once('error', reject); backend.server.listen(0, '127.0.0.1', resolve); });
  backendUrl = `http://127.0.0.1:${backend.server.address().port}`;
  process.parentPort.postMessage({ type: 'ready', url: backendUrl });
} catch {
  process.parentPort.postMessage({ type: 'failed', message: 'Não foi possível abrir os dados locais. Consulte o diagnóstico ou selecione outra pasta.' });
  process.exit(1);
}

process.parentPort.on('message', async ({ data }) => {
  if (data?.type === 'abas-resposta') {
    const pedido = pendentes.get(data.id);
    if (!pedido) return;
    pendentes.delete(data.id);
    clearTimeout(pedido.prazo);
    if (data.ok) pedido.resolve(data.result); else pedido.reject(new Error(data.error || 'Falha na aba.'));
    return;
  }
  if (data?.type !== 'shutdown') return;
  backend.server.closeAllConnections();
  await new Promise(resolve => backend.server.close(resolve));
  await backend.runtime.close();
  process.exit(0);
});
