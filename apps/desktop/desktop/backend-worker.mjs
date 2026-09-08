import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRuntimeServer } from '../app/src/runtime-server.mjs';

// O processo principal informa o endpoint de depuração do Chromium do Electron.
// Com ele, o navegador das plataformas são abas dentro da janela; sem ele, o
// Playwright lança o Chromium separado, como antes.
const [, , rootDir, cdpEndpoint = ''] = process.argv;
let backend;
let backendUrl = '';

// O worker não tem console visível (stdio ignorado): erros e avisos vão para
// estado/logs/servico.log. Rejeição sem tratamento é registrada e o serviço
// segue; exceção síncrona inesperada encerra o processo, e o supervisor mostra
// o diagnóstico com o motivo.
async function registrar(origem, erro) {
  try {
    await mkdir(join(rootDir, 'estado', 'logs'), { recursive: true });
    await appendFile(join(rootDir, 'estado', 'logs', 'servico.log'), `${new Date().toISOString()} ${origem}: ${erro?.stack ?? erro}\n`);
  } catch { /* sem onde registrar */ }
}
process.on('unhandledRejection', (erro) => { void registrar('unhandledRejection', erro); });
process.on('uncaughtException', (erro) => { registrar('uncaughtException', erro).finally(() => process.exit(1)); });
process.on('warning', (aviso) => { if (aviso?.code === 'FLUXO_FALHA_SILENCIOSA') void registrar('aviso', aviso.message); });

const pendentes = new Map();
let proximoId = 0;
function pedirAoPrincipal(type, op, payload = {}, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const id = `${type}-${++proximoId}`;
    const prazo = setTimeout(() => {
      pendentes.delete(id);
      const code = type === 'skynet' ? 'skynet_bridge_timeout' : 'browser_tab_unavailable';
      reject(Object.assign(new Error('A janela não respondeu no prazo.'), { code, retryable: true }));
    }, timeoutMs);
    pendentes.set(id, { resolve, reject, prazo, type });
    try { process.parentPort.postMessage({ type, id, op, ...payload }); }
    catch (erro) { clearTimeout(prazo); pendentes.delete(id); reject(erro); }
  });
}

const browserHost = cdpEndpoint
  ? {
    cdpEndpoint,
    markerUrl: (platform) => `${backendUrl}/aba/${encodeURIComponent(String(platform).toUpperCase())}`,
    openTab: (platform, url) => pedirAoPrincipal('abas', 'abrir', { platform, url }),
    showTab: (platform) => pedirAoPrincipal('abas', 'mostrar', { platform }),
    hideTab: () => pedirAoPrincipal('abas', 'esconder'),
    listTabs: () => pedirAoPrincipal('abas', 'listar')
  }
  : null;

const skynetHost = {
  status: () => pedirAoPrincipal('skynet', 'status'),
  startLogin: () => pedirAoPrincipal('skynet', 'login', {}, 30_000),
  logout: () => pedirAoPrincipal('skynet', 'logout', {}, 30_000),
  chat: (input) => pedirAoPrincipal('skynet', 'chat', { input }, 4 * 60_000),
  interrupt: (operationId = '') => pedirAoPrincipal('skynet', 'interrupt', { operationId })
};

try {
  backend = await createRuntimeServer({ rootDir, port: 0, browserHost, skynetHost });
  await new Promise((resolve, reject) => { backend.server.once('error', reject); backend.server.listen(0, '127.0.0.1', resolve); });
  backendUrl = `http://127.0.0.1:${backend.server.address().port}`;
  process.parentPort.postMessage({ type: 'ready', url: backendUrl });
} catch (erro) {
  await registrar('inicialização', erro);
  process.parentPort.postMessage({ type: 'failed', message: 'Não foi possível abrir os dados locais. Consulte o diagnóstico ou selecione outra pasta.', detail: String(erro?.message ?? erro) });
  process.exit(1);
}

// Encerramento idempotente: um segundo `shutdown` reaproveita o mesmo caminho.
let encerramento = null;
function encerrar() {
  if (!encerramento) encerramento = (async () => {
    try {
      backend.server.closeAllConnections();
      await new Promise(resolve => backend.server.close(() => resolve()));
      await backend.runtime.close();
    } catch (erro) { await registrar('encerramento', erro); }
    finally { process.exit(0); }
  })();
  return encerramento;
}

process.parentPort.on('message', ({ data }) => {
  if (data?.type === 'abas-resposta' || data?.type === 'skynet-resposta') {
    const pedido = pendentes.get(data.id);
    if (!pedido) return; // resposta atrasada de um pedido que já expirou
    pendentes.delete(data.id);
    clearTimeout(pedido.prazo);
    const fallbackCode = pedido.type === 'skynet' ? 'skynet_bridge_failed' : 'browser_tab_unavailable';
    if (data.ok) pedido.resolve(data.result);
    else pedido.reject(Object.assign(new Error(data.error?.message || data.error || 'Falha na janela.'), { code: data.error?.code || fallbackCode }));
    return;
  }
  if (data?.type === 'skynet-event' && data.event === 'status') {
    backend?.runtime?.skynetAuthService?.handleStatus(data.status);
    return;
  }
  if (data?.type === 'shutdown') void encerrar();
});
