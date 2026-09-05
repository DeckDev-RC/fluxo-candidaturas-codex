import { createRuntimeServer } from '../app/src/runtime-server.mjs';

let backend;
try {
  const rootDir = process.argv[2];
  backend = await createRuntimeServer({ rootDir, port: 0 });
  await new Promise((resolve, reject) => { backend.server.once('error', reject); backend.server.listen(0, '127.0.0.1', resolve); });
  process.parentPort.postMessage({ type: 'ready', url: `http://127.0.0.1:${backend.server.address().port}` });
} catch {
  process.parentPort.postMessage({ type: 'failed', message: 'Não foi possível abrir os dados locais. Consulte o diagnóstico ou selecione outra pasta.' });
  process.exit(1);
}
process.parentPort.on('message', async ({ data }) => {
  if (data?.type !== 'shutdown') return;
  backend.server.closeAllConnections();
  await new Promise(resolve => backend.server.close(resolve));
  await backend.runtime.close();
  process.exit(0);
});
