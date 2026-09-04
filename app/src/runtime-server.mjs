import { createLocalRuntime } from './runtime.mjs';
import { createServer } from './http-server.mjs';

export async function createRuntimeServer({ rootDir, port = 4173 } = {}) {
  const runtime = await createLocalRuntime({ rootDir });
  const server = createServer({
    rootDir,
    queueService: runtime.queueService,
    runService: runtime.runService,
    approvalService: runtime.approvalService,
    stateStore: runtime.stateStore,
    applicationFlow: runtime.applicationFlow
  });
  return { runtime, server, port };
}
