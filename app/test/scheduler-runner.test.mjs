import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSchedulerRunner } from '../src/scheduler-runner.mjs';
import { createSchedulerService } from '../src/scheduler-service.mjs';
import { createCampaignBudget } from '../src/campaign-budget.mjs';

// Sem executor, a agenda era só um registro em arquivo: o intervalo configurado
// nunca disparava a consulta. Estes testes existem para pegar essa regressão.

test('a agenda vencida dispara a consulta e avança o próximo horário', async () => {
  const raiz = await mkdtemp(join(tmpdir(), 'fluxo-agenda-'));
  let agora = new Date('2026-09-05T10:00:00.000Z');
  const scheduler = createSchedulerService({ rootDir: raiz, minIntervalMs: 60_000, now: () => agora });
  const consultas = [];
  const notificacoes = [];
  const runner = createSchedulerRunner({
    schedulerService: scheduler,
    followUpMonitor: { async check(payload) { consultas.push(payload); return { newEvents: [{ type: 'entrevista', status: 'entrevista', note: 'Convite recebido', applicationId: 'app-1' }], failures: [] }; } },
    notificationService: { async notify(item) { notificacoes.push(item); return item; } }
  });

  await scheduler.schedule({ id: 'followup', intervalMs: 60_000, payload: { instruction: 'acompanhar' } });
  assert.deepEqual(await runner.tick(), [], 'nada vence antes do intervalo');

  agora = new Date('2026-09-05T10:01:30.000Z');
  const execucoes = await runner.tick();
  assert.equal(execucoes.length, 1);
  assert.equal(execucoes[0].status, 'consultado');
  assert.equal(execucoes[0].novidades, 1);
  assert.deepEqual(consultas, [{ instruction: 'acompanhar' }]);
  assert.equal(notificacoes[0].title, 'Convite para entrevista');
  assert.equal(notificacoes[0].reference, 'app-1');

  const job = (await scheduler.list())[0];
  assert.equal(job.running, false);
  assert.equal(job.nextAt, '2026-09-05T10:02:30.000Z');
});

test('ausência de adaptador vira aviso de conferência manual, não "nenhuma novidade"', async () => {
  const raiz = await mkdtemp(join(tmpdir(), 'fluxo-agenda-'));
  let agora = new Date('2026-09-05T10:00:00.000Z');
  const scheduler = createSchedulerService({ rootDir: raiz, minIntervalMs: 60_000, now: () => agora });
  const notificacoes = [];
  const runner = createSchedulerRunner({
    schedulerService: scheduler,
    followUpMonitor: { async check() { return { newEvents: [], failures: [{ type: 'unsupported', message: 'Sem consulta automática nesta plataforma.', reference: 'app-2' }] }; } },
    notificationService: { async notify(item) { notificacoes.push(item); return item; } }
  });

  await scheduler.schedule({ id: 'followup', intervalMs: 60_000 });
  agora = new Date('2026-09-05T10:02:00.000Z');
  await runner.tick();

  assert.equal(notificacoes.length, 1);
  assert.equal(notificacoes[0].kind, 'followup_manual');
  assert.match(notificacoes[0].nextAction, /registrar o retorno/);
});

test('consulta em andamento não é duplicada e falha não trava a agenda', async () => {
  const raiz = await mkdtemp(join(tmpdir(), 'fluxo-agenda-'));
  let agora = new Date('2026-09-05T10:05:00.000Z');
  const scheduler = createSchedulerService({ rootDir: raiz, minIntervalMs: 60_000, now: () => agora });
  const runner = createSchedulerRunner({
    schedulerService: scheduler,
    followUpMonitor: { async check() { throw Object.assign(new Error('rede indisponível'), { code: 'network_error' }); } },
    notificationService: { async notify() {} }
  });

  await scheduler.schedule({ id: 'followup', intervalMs: 60_000 });
  agora = new Date('2026-09-05T10:07:00.000Z');
  await scheduler.begin('followup');
  assert.deepEqual(await runner.tick(), [], 'job em execução não entra na fila de vencidos');

  await scheduler.finish('followup', { skipAdvance: true });
  const execucoes = await runner.tick();
  assert.equal(execucoes[0].status, 'falhou');
  assert.equal((await scheduler.list())[0].running, false, 'a falha precisa liberar o job');
});

test('campanha cancelada não dispara consulta nem avança a agenda', async () => {
  const raiz = await mkdtemp(join(tmpdir(), 'fluxo-agenda-'));
  let agora = new Date('2026-09-05T10:05:00.000Z');
  const scheduler = createSchedulerService({ rootDir: raiz, minIntervalMs: 60_000, now: () => agora });
  const budget = createCampaignBudget({ config: {} });
  budget.cancel();
  let consultou = false;
  const runner = createSchedulerRunner({
    schedulerService: scheduler,
    followUpMonitor: { async check() { consultou = true; return { newEvents: [] }; } },
    notificationService: { async notify() {} },
    budget
  });

  await scheduler.schedule({ id: 'followup', intervalMs: 60_000 });
  agora = new Date('2026-09-05T10:07:00.000Z');
  const execucoes = await runner.tick();
  assert.equal(execucoes[0].status, 'cancelado');
  assert.equal(consultou, false);
  assert.equal((await scheduler.list())[0].nextAt, '2026-09-05T10:06:00.000Z', 'a agenda não avança com a campanha cancelada');
});

test('o laço usa o temporizador injetado e para ao encerrar', async () => {
  const raiz = await mkdtemp(join(tmpdir(), 'fluxo-agenda-'));
  const scheduler = createSchedulerService({ rootDir: raiz, minIntervalMs: 60_000 });
  const timers = [];
  const runner = createSchedulerRunner({
    schedulerService: scheduler,
    followUpMonitor: { async check() { return { newEvents: [] }; } },
    notificationService: { async notify() {} },
    tickMs: 1000,
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => { timers.length = 0; }
  });

  runner.start();
  assert.equal(runner.running, true);
  assert.equal(timers.length, 1, 'o executor precisa agendar a próxima passagem');
  runner.stop();
  assert.equal(runner.running, false);
  assert.equal(timers.length, 0);
});
