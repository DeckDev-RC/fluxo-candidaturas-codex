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
    applicationFlow: runtime.applicationFlow,
    resumeService: runtime.resumeService,
    evidenceService: runtime.evidenceService,
    assessmentService: runtime.assessmentService,
    legacyImportService: runtime.legacyImportService,
    pendingService: runtime.pendingService,
    checkpointService: runtime.checkpointService,
    metricsService: runtime.metricsService,
    agentAdapter: runtime.agentAdapter
  });
  return { runtime, server, port };
}
