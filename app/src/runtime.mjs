import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createAgentAdapter } from './agent-adapter.mjs';
import { createApplicationFlow } from './application-flow.mjs';
import { createApplicationService } from './application-service.mjs';
import { createApprovalService } from './approval-service.mjs';
import { createBrowserAdapter } from './browser-adapter.mjs';
import { createPlaywrightCliDriver } from './playwright-cli-driver.mjs';
import { createQueueService } from './queue-service.mjs';
import { createRunService } from './run-service.mjs';
import { createStdioAgentTransport } from './stdio-agent-transport.mjs';
import { createStore } from './store.mjs';
import { readRuntimeConfig } from './runtime-config.mjs';
import { readFluxoState } from './state-reader.mjs';

export async function createLocalRuntime({ rootDir }) {
  await mkdir(join(rootDir, 'estado'), { recursive: true });
  const runtimeConfig = await readRuntimeConfig(rootDir);
  const dbPath = join(rootDir, 'estado', 'harness.sqlite');
  const queueService = createQueueService({ rootDir });
  const runService = createRunService({ dbPath, maxApplicationsPerRun: runtimeConfig.maxApplicationsPerRun });
  const approvalService = createApprovalService({ dbPath });
  const stateStore = createStore({ rootDir, dbPath });
  const browserAdapter = createBrowserAdapter({
    driver: createPlaywrightCliDriver({ session: runtimeConfig.playwrightSession })
  });
  const applicationService = createApplicationService({ rootDir });
  const applicationFlow = createApplicationFlow({
    queueService,
    runService,
    approvalService,
    browserAdapter,
    preflightReady: async () => (await readFluxoState(rootDir)).installation.ready,
    async recordApplication(input) {
      return applicationService.recordConfirmedApplication({
        item: input.item,
        confirmation: input.confirmation,
        evidencePath: input.payload?.evidencePath ?? '',
        resume: input.payload?.resume ?? '',
        applicationId: input.payload?.applicationId ?? '',
        notes: input.payload?.notes ?? ''
      });
    }
  });
  const agentAdapter = createAgentAdapter({
    transportFactory: () => createStdioAgentTransport({ cwd: rootDir })
  });
  runService.reconcile();
  await stateStore.syncFromFiles();

  return {
    runtimeConfig,
    queueService,
    runService,
    approvalService,
    stateStore,
    browserAdapter,
    agentAdapter,
    applicationFlow,
    async close() {
      await agentAdapter.close();
      stateStore.close();
      approvalService.close();
      runService.close();
    }
  };
}
