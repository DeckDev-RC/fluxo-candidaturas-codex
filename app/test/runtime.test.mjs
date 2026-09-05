import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalRuntime } from '../src/runtime.mjs';
import { createRunService } from '../src/run-service.mjs';

test('local runtime composes state, queue, approval, browser and agent adapters lazily', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-runtime-'));
  for (const directory of ['estado', 'campanha', 'fila', 'candidaturas']) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ platforms: [] }));
  await writeFile(join(root, 'fila', 'vagas.json'), '[]');
  await writeFile(join(root, 'candidaturas', 'candidaturas.json'), '[]');

  const runtime = await createLocalRuntime({ rootDir: root });

  try {
    assert.equal(typeof runtime.applicationFlow.prepareNext, 'function');
    assert.equal(typeof runtime.policyGateway.requestApproval, 'function');
    assert.equal(typeof runtime.browserAdapter.snapshot, 'function');
    assert.equal(typeof runtime.agentAdapter.runTurn, 'function');
    assert.equal(runtime.runtimeConfig.playwrightSession, 'candidaturas');
    const approval = runtime.assessmentService.requestTimedTestApproval({ runId: 'run-1', payload: { name: 'Lógica', durationSeconds: 900 } });
    assert.equal(approval.kind, 'timed_test');
    const messageApproval = runtime.messageService.requestSendApproval({ runId: 'run-1', payload: { recipient: 'Pessoa Teste', text: 'Olá, Pessoa Teste.' } });
    assert.equal(messageApproval.kind, 'message');
  } finally {
    await runtime.close();
  }
});

test('local runtime reconciles runs left running by a previous process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-runtime-'));
  for (const directory of ['estado', 'campanha', 'fila', 'candidaturas']) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ platforms: [] }));
  await writeFile(join(root, 'fila', 'vagas.json'), '[]');
  await writeFile(join(root, 'candidaturas', 'candidaturas.json'), '[]');
  const seed = createRunService({ dbPath: join(root, 'estado', 'harness.sqlite') });
  const run = seed.startRun({ kind: 'campaign' });
  seed.close();

  const runtime = await createLocalRuntime({ rootDir: root });

  try {
    assert.equal(runtime.runService.getRun(run.id).status, 'needs_reconcile');
  } finally {
    await runtime.close();
  }
});
