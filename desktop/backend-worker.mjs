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
function pedirAoPrincipal(op, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = `abas-${++proximoId}`;
    const prazo = setTimeout(() => { pendentes.delete(id); reject(Object.assign(new Error('A janela não respondeu ao pedido de aba.'), { code: 'browser_tab_unavailable', retryable: true })); }, 15_000);
    pendentes.set(id, { resolve, reject, prazo });
    try { process.parentPort.postMessage({ type: 'abas', id, op, ...payload }); }
    catch (erro) { clearTimeout(prazo); pendentes.delete(id); reject(erro); }
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
  if (data?.type === 'abas-resposta') {
    const pedido = pendentes.get(data.id);
    if (!pedido) return; // resposta atrasada de um pedido que já expirou
    pendentes.delete(data.id);
    clearTimeout(pedido.prazo);
    if (data.ok) pedido.resolve(data.result); else pedido.reject(Object.assign(new Error(data.error || 'Falha na aba.'), { code: 'browser_tab_unavailable' }));
    return;
  }
  if (data?.type === 'shutdown') void encerrar();
});
