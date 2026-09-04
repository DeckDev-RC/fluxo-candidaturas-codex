import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceService } from '../src/evidence-service.mjs';
import { createLegacyImportService } from '../src/legacy-import-service.mjs';
import { createPendingService } from '../src/pending-service.mjs';
import { createAssessmentService } from '../src/assessment-service.mjs';

test('evidence service records a local evidence reference', async () => {
  const calls = [];
  const service = createEvidenceService({ async scriptRunner(name, args) { calls.push({ name, args }); return { ok: true, stdout: 'evidencias/confirmacao.png' }; } });
  const result = await service.record({ sourcePath: 'estado/confirmacao.png', reference: 'vaga-1', type: 'envio' });
  assert.equal(result.path, 'evidencias/confirmacao.png');
  assert.equal(calls[0].name, 'registrar-evidencia.ps1');
});

test('assessment service records test result with score fields', async () => {
  const calls = [];
  const service = createAssessmentService({ async scriptRunner(name, args) { calls.push({ name, args }); return { ok: true, stdout: '{"status":"concluído"}' }; } });
  await service.record({ reference: 'app-1', testName: 'Técnico', provider: 'Acme', status: 'concluído', score: '9', total: '10' });
  assert.equal(calls[0].name, 'registrar-resultado-teste.ps1');
  assert.ok(calls[0].args.includes('-Score'));
});

test('legacy import service is explicit about its source directory', async () => {
  const calls = [];
  const service = createLegacyImportService({ async scriptRunner(name, args) { calls.push({ name, args }); return { ok: true, stdout: 'files : 1\nimported : 1' }; } });
  await service.import({ directory: 'legado', pattern: 'controle_*.md' });
  assert.equal(calls[0].name, 'importar-controles-legados.ps1');
  assert.deepEqual(calls[0].args.slice(0, 4), ['-Directory', 'legado', '-Pattern', 'controle_*.md']);
});

test('operation paths reject Windows absolute paths', async () => {
  const evidence = createEvidenceService({ async scriptRunner() { throw new Error('must not run'); } });
  const legacy = createLegacyImportService({ async scriptRunner() { throw new Error('must not run'); } });
  await assert.rejects(() => evidence.record({ sourcePath: 'C:\\private.png', reference: 'x' }), (error) => error.code === 'invalid_evidence');
  await assert.rejects(() => legacy.import({ directory: 'C:\\legacy' }), (error) => error.code === 'invalid_import_directory');
});

test('pending service returns structured pending actions', async () => {
  const service = createPendingService({ async scriptRunner() { return { ok: true, stdout: '[{"urgency":"próxima","reference":"app-1"}]' }; } });
  assert.deepEqual(await service.list({ dueWithinDays: 5 }), [{ urgency: 'próxima', reference: 'app-1' }]);
});

test('assessment service lists recorded questionnaires from local applications', async () => {
  const service = createAssessmentService({ rootDir: 'unused', async readApplications() { return [{ id: 'app-1', assessment: { name: 'Técnico', status: 'concluído' } }]; } });
  assert.deepEqual(await service.list(), [{ reference: 'app-1', name: 'Técnico', status: 'concluído' }]);
});

test('assessment service prepares a non-automated questionnaire timer', async () => {
  const service = createAssessmentService({ rootDir: 'unused' });
  const prepared = await service.prepare({ name: 'Cultura', questions: [{ id: 'q1', prompt: 'Disponibilidade?' }], durationSeconds: 60 });
  assert.equal(prepared.timed, true);
  assert.equal(prepared.timerMode, 'informativo');
  assert.equal(prepared.questions[0].id, 'q1');
});
