import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createExceptionService } from '../src/exception-service.mjs';
import { createFollowUpMonitor } from '../src/follow-up-monitor.mjs';

test('exception service pauses a run, explains what unlocks it, and resumes after the user response', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-exception-'));
  const calls = [];
  const service = createExceptionService({ rootDir: root, runService: { pauseRun(id, reason) { calls.push(['pause', id, reason]); }, resumeRun(id) { calls.push(['resume', id]); } } });
  const exception = await service.create({ runId: 'run-1', platform: 'GUPY', type: 'captcha', action: 'Resolva o CAPTCHA no navegador local.' });

  assert.equal(exception.status, 'open');
  assert.equal(exception.priority, 'alta');
  assert.match(exception.message, /CAPTCHA/i);
  assert.match(exception.unblocks, /resolver/i);
  assert.deepEqual(calls[0].slice(0, 2), ['pause', 'run-1']);

  const resolved = await service.respond(exception.id, { response: 'Resolvido no navegador' });
  assert.equal(resolved.status, 'resolved');
  assert.deepEqual(calls.at(-1), ['resume', 'run-1']);
  assert.match(await readFile(join(root, 'estado', 'excecoes.json'), 'utf8'), /Resolvido/);
});

test('exception service keeps a safe prioritized inbox for missing data and reconciliation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-exception-list-'));
  const service = createExceptionService({ rootDir: root });
  await service.create({ runId: 'run-2', type: 'missing_data', field: 'telefone' });
  await service.create({ runId: 'run-2', type: 'divergence', platform: 'INFOJOBS', observed: 'outra tela', expected: 'formulário' });
  const inbox = await service.list({ status: 'open' });
  assert.equal(inbox.length, 2);
  assert.ok(inbox.every((item) => item.nextAction && item.type));
  assert.equal('observed' in inbox[0], false);
});

test('follow-up monitor deduplicates platform events and returns actionable alerts and change summary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-follow-up-'));
  let calls = 0;
  const monitor = createFollowUpMonitor({ rootDir: root, now: () => new Date('2026-09-04T12:00:00.000Z'), adapters: { GUPY: { async status() { calls += 1; return [{ id: 'event-1', type: 'entrevista', status: 'convite recebido', note: 'Entrevista amanhã', nextAction: 'Confirmar horário', deadline: '2026-09-05' }]; } } } });
  const application = { id: 'app-1', platform: 'GUPY', company: 'Acme', role: 'Backend', identifierOrUrl: 'job-1', status: 'triagem' };

  const first = await monitor.check({ applications: [application], instruction: 'acompanhe tudo desta semana' });
  const second = await monitor.check({ applications: [application] });
  assert.equal(calls, 2);
  assert.equal(first.newEvents.length, 1);
  assert.equal(second.newEvents.length, 0);
  assert.equal(first.alerts[0].priority, 'alta');
  assert.equal(first.alerts[0].nextAction, 'Confirmar horário');
  assert.match(first.summary, /1 novidade/i);
  assert.equal(first.newEvents[0].source, 'GUPY');
});
