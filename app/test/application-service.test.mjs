import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplicationService } from '../src/application-service.mjs';

test('application service records only a visually confirmed submission', async () => {
  const calls = [];
  const service = createApplicationService({
    async scriptRunner(name, args) {
      calls.push({ name, args });
      return { ok: true, exitCode: 0, stdout: '{"id":"app-1","status":"enviada"}', stderr: '' };
    }
  });

  const result = await service.recordConfirmedApplication({
    item: { platform: 'GUPY', company: 'Acme', role: 'Dev', identifierOrUrl: '123' },
    confirmation: { confirmed: true },
    evidencePath: 'evidencias/app-1.json',
    resume: 'curriculo/backend.pdf'
  });

  assert.equal(result.record.status, 'enviada');
  assert.equal(calls[0].name, 'nova-candidatura.ps1');
  assert.equal(calls[0].args.includes('-Status'), true);
  assert.equal(calls[0].args.includes('enviada'), true);
});

test('application service refuses unconfirmed submission without calling script', async () => {
  let called = false;
  const service = createApplicationService({
    async scriptRunner() { called = true; }
  });

  await assert.rejects(
    () => service.recordConfirmedApplication({ item: { platform: 'GUPY' }, confirmation: { confirmed: false } }),
    (error) => error.code === 'submission_not_confirmed'
  );
  assert.equal(called, false);
});

test('application service requires evidence path for a confirmed submission', async () => {
  let called = false;
  const service = createApplicationService({
    async scriptRunner() { called = true; }
  });

  await assert.rejects(
    () => service.recordConfirmedApplication({
      item: { platform: 'GUPY', company: 'Acme', role: 'Dev', identifierOrUrl: '1' },
      confirmation: { confirmed: true }
    }),
    (error) => error.code === 'evidence_required'
  );
  assert.equal(called, false);
});

test('application service rejects resume and evidence paths outside Fluxo folders', async () => {
  const service = createApplicationService({ async scriptRunner() { throw new Error('must not run'); } });
  const item = { platform: 'GUPY', company: 'Acme', role: 'Dev', identifierOrUrl: '1' };

  await assert.rejects(
    () => service.recordConfirmedApplication({ item, confirmation: { confirmed: true }, evidencePath: '..\\secret.txt' }),
    (error) => error.code === 'invalid_evidence_path'
  );
  await assert.rejects(
    () => service.recordConfirmedApplication({ item, confirmation: { confirmed: true }, evidencePath: 'evidencias/app.json', resume: '..\\private.pdf' }),
    (error) => error.code === 'invalid_resume_path'
  );
});
