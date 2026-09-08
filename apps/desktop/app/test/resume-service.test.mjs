import test from 'node:test';
import assert from 'node:assert/strict';
import { createResumeService } from '../src/resume-service.mjs';

test('resume service extracts and selects through allowlisted scripts', async () => {
  const calls = [];
  const service = createResumeService({ async scriptRunner(name, args) { calls.push({ name, args }); return { ok: true, stdout: name === 'calcular-aderencia.ps1' ? '{"score":82,"classification":"A"}' : 'curriculo/cv.txt' }; } });
  assert.equal((await service.extract({ path: 'curriculo/cv.docx', force: true })).path, 'curriculo/cv.txt');
  assert.deepEqual(await service.fit({ jobDescription: 'Node APIs', resumeTextPath: 'curriculo/cv.txt' }), { score: 82, classification: 'A' });
  assert.equal(calls[0].name, 'extrair-curriculo.ps1');
  assert.equal(calls[1].args.includes('-ResumeTextPath'), true);
});

test('resume service refuses paths outside the local resume directory', async () => {
  const service = createResumeService({ async scriptRunner() { throw new Error('must not run'); } });
  await assert.rejects(() => service.extract({ path: '../secret.pdf' }), (error) => error.code === 'invalid_resume_path');
});
