import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createSupervisor } from '../supervisor.mjs';

test('supervisor awaits backend readiness and requests graceful stop', async () => {
  const child = new EventEmitter(); let launches = 0; let stopped = false;
  child.kill = () => { throw new Error('must stop gracefully'); };
  child.postMessage = message => { assert.equal(message.type, 'shutdown'); stopped = true; queueMicrotask(() => child.emit('exit', 0)); };
  const service = createSupervisor({ launch: () => { launches++; queueMicrotask(() => child.emit('message', { type: 'ready', url: 'http://127.0.0.1:4173' })); return child; } });
  assert.equal((await service.start()).url, 'http://127.0.0.1:4173');
  assert.equal((await service.start()).url, 'http://127.0.0.1:4173');
  assert.equal(launches, 1);
  await service.stop(); assert.equal(stopped, true);
});

test('startup crash rejects rather than displaying a working application', async () => {
  const child = new EventEmitter(); child.kill = () => {};
  const service = createSupervisor({ launch: () => { queueMicrotask(() => child.emit('exit', 1)); return child; } });
  await assert.rejects(service.start(), { code: 'backend_start_failed' });
});
