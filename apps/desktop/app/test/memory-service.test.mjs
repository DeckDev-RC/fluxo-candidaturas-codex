import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryService } from '../src/memory-service.mjs';

test('memory stores confirmed facts with readable provenance and returns a safe active summary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-memory-'));
  const service = createMemoryService({ rootDir: root, now: () => new Date('2026-09-04T12:00:00.000Z') });

  await service.upsertFacts([
    { key: 'name', value: 'Pessoa Teste', source: 'curriculo/cv.txt', confirmed: true },
    { key: 'targetRoles', value: ['Backend', 'Dados'], source: 'onboarding', confirmed: true },
    { key: 'password', value: 'não deve aparecer', source: 'manual', sensitive: true }
  ]);
  await service.saveResumeVariant({ path: 'curriculo/cv.txt', label: 'Currículo principal', objective: 'Backend', selected: true });

  const summary = await service.safeSummary();
  assert.equal(summary.facts.name.value, 'Pessoa Teste');
  assert.deepEqual(summary.facts.targetRoles.value, ['Backend', 'Dados']);
  assert.equal(summary.facts.name.source, 'curriculo/cv.txt');
  assert.equal(summary.facts.name.updatedAt, '2026-09-04T12:00:00.000Z');
  assert.equal('password' in summary.facts, false);
  assert.equal(summary.selectedResume.path, 'curriculo/cv.txt');
  assert.equal(summary.lastUpdated, '2026-09-04T12:00:00.000Z');
});

test('memory edits and removes a fact without deleting the remaining context', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-memory-edit-'));
  const service = createMemoryService({ rootDir: root });
  await service.upsertFacts([{ key: 'location', value: 'São Paulo', source: 'manual', confirmed: true }, { key: 'languages', value: ['Português'], source: 'manual', confirmed: true }]);

  await service.upsertFacts([{ key: 'location', value: 'Remoto', source: 'correção do usuário', confirmed: true }]);
  await service.removeFact('languages');
  const memory = await service.get();

  assert.equal(memory.facts.location.value, 'Remoto');
  assert.equal(memory.facts.languages, undefined);
  assert.match(await readFile(join(root, 'estado', 'memoria.json'), 'utf8'), /correção do usuário/);
});

test('memory records run context and creates a task-ready summary without secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-memory-context-'));
  const service = createMemoryService({ rootDir: root });
  await service.upsertFacts([{ key: 'targetRoles', value: 'QA', source: 'onboarding', confirmed: true }, { key: 'apiToken', value: 'secret', source: 'runtime', sensitive: true }]);
  await service.recordExecution({ runId: 'run-1', objective: 'Encontrar vagas de QA', status: 'running', checkpoint: 'discovery' });

  const context = await service.contextForTask({ task: 'discovery', runId: 'run-1' });
  assert.equal(context.objective, 'Encontrar vagas de QA');
  assert.equal(context.facts.targetRoles.value, 'QA');
  assert.equal('apiToken' in context.facts, false);
  assert.equal(context.execution.checkpoint, 'discovery');
});
