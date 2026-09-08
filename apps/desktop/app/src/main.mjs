import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createRuntimeServer } from './runtime-server.mjs';

const rootDir = process.env.FLUXO_ROOT
  ? resolve(process.env.FLUXO_ROOT)
  : resolve(fileURLToPath(new URL('../..', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const runtimeServer = await createRuntimeServer({ rootDir, port });
const server = runtimeServer.server;

server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  console.log(`Fluxo app disponível em http://127.0.0.1:${address.port}`);
});

function shutdown() {
  server.close(async () => {
    await runtimeServer.runtime.close();
    process.exit(0);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
