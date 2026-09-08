import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalRuntime } from '../src/runtime.mjs';

test('local fixture runtime completes the full Autopilot journey without external actions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-fixture-runtime-'));
  for (const directory of ['estado', 'config', 'campanha', 'fila', 'candidaturas', 'curriculo', 'evidencias']) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, 'config', 'plataformas.json'), JSON.stringify({ platforms: [{ name: 'GUPY' }] }));
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ platforms: [{ name: 'GUPY', enabled: true, goal: 2 }] }));
  await writeFile(join(root, 'fila', 'vagas.json'), '[]');
  await writeFile(join(root, 'candidaturas', 'candidaturas.json'), '[]');
  await writeFile(join(root, 'curriculo', 'cv.txt'), 'Nome: Pessoa Teste\nE-mail: ana@example.com\nTelefone: 000\nLocalização: Remoto\nCargo-alvo: Backend\nCompetências: Node.js');
  const runtime = await createLocalRuntime({ rootDir: root });
  try {
    const started = await runtime.autopilotService.start({ intent: 'Encontrar vagas remotas de backend', mode: 'fixture', resumePath: 'curriculo/cv.txt' });
    const finished = await started.completion;
    assert.equal(finished.status, 'succeeded');
    assert.equal(runtime.runService.getRun(started.run.id).status, 'succeeded');
    assert.ok((await runtime.memoryService.safeSummary()).lastExecution);
    assert.ok((await runtime.queueService.listQueue()).items.length >= 1);
    assert.equal(runtime.runService.listEvents(started.run.id).filter((event) => event.type === 'autopilot.task.completed').length, 5);
  } finally { await runtime.close(); }
});
