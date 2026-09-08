import test from 'node:test';
import assert from 'node:assert/strict';
import { createFollowUpService } from '../src/follow-up-service.mjs';

test('follow-up service records an event through the allowlisted script', async () => {
  const calls = [];
  const service = createFollowUpService({
    async scriptRunner(name, args) {
      calls.push({ name, args });
      return { ok: true, exitCode: 0, stdout: '{"status":"triagem"}', stderr: '' };
    }
  });

  const result = await service.recordEvent({ reference: 'app-1', type: 'status', status: 'triagem', nextAction: 'Aguardar retorno' });

  assert.equal(result.status, 'triagem');
  assert.equal(calls[0].name, 'registrar-evento.ps1');
  assert.deepEqual(calls[0].args.slice(0, 6), ['-Reference', 'app-1', '-Type', 'status', '-Status', 'triagem']);
});

test('follow-up service refuses unsupported event types before running a script', async () => {
  let called = false;
  const service = createFollowUpService({ async scriptRunner() { called = true; } });

  await assert.rejects(
    () => service.recordEvent({ reference: 'app-1', type: 'unknown' }),
    (error) => error.code === 'invalid_event_type'
  );
  assert.equal(called, false);
});
