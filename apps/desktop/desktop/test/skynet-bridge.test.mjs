import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSkynetBridge } = require('../skynet-bridge.cjs');

test('bridge inicia helper isolado, correlaciona pedidos e encerra uma vez', async () => {
  const spawns = [];
  const statuses = [];
  const logs = [];
  const sent = [];
  const child = fakeChild(sent);
  const bridge = createSkynetBridge({
    app: { isPackaged: false, getPath: () => 'C:\\dados', getAppPath: () => 'C:\\app' },
    spawn: (command, args, options) => {
      spawns.push({ command, args, options });
      setImmediate(() => child.emit('message', { type: 'ready' }));
      return child;
    },
    onStatus: (status) => statuses.push(status),
    onLog: (text) => logs.push(text)
  });

  const statusPromise = bridge.status();
  await new Promise((resolve) => setImmediate(resolve));
  const request = sent.find((message) => message.op === 'status');
  child.emit('message', { type: 'skynet-response', id: request.id, ok: true, result: { authenticated: true } });
  assert.deepEqual(await statusPromise, { authenticated: true });
  assert.equal(spawns.length, 1);
  assert.deepEqual(spawns[0].args, ['C:\\app']);
  assert.equal(spawns[0].options.env.FLUXO_SKYNET_HELPER, '1');
  assert.equal('ELECTRON_RUN_AS_NODE' in spawns[0].options.env, false);
  child.stderr.write(' \r\n');
  child.stdout.write('aviso sintético\r\n');
  assert.deepEqual(logs, ['aviso sintético'], 'saída vazia do helper não vira erro');

  child.emit('message', { type: 'skynet-event', event: 'status', status: { authenticated: true } });
  assert.deepEqual(statuses, [{ authenticated: true }]);

  const firstStop = bridge.stop();
  const secondStop = bridge.stop();
  assert.equal(firstStop, secondStop);
  await firstStop;
  assert.equal(sent.filter((message) => message.op === 'shutdown').length, 1);
  await assert.rejects(bridge.interrupt('turno-antigo'), { code: 'skynet_helper_stopping' });
  assert.equal(spawns.length, 1, 'shutdown nunca relança o helper');
});

test('saída tardia de helper antigo não rejeita pedidos do helper novo', async () => {
  const sent = [[], []];
  const children = [fakeChild(sent[0]), fakeChild(sent[1])];
  children[0].kill = () => {};
  let spawned = 0;
  const bridge = createSkynetBridge({
    app: { isPackaged: true, getPath: () => 'C:\\dados', getAppPath: () => 'C:\\app' },
    spawn: () => {
      const index = spawned++;
      const child = children[index];
      if (index === 1) setImmediate(() => child.emit('message', { type: 'ready' }));
      return child;
    },
    startupTimeoutMs: 10
  });

  await assert.rejects(bridge.status(), { code: 'skynet_helper_timeout' });
  const currentStatus = bridge.status();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const request = sent[1].find((message) => message.op === 'status');
  children[0].emit('exit', 1);
  children[1].emit('message', { type: 'skynet-response', id: request.id, ok: true, result: { authenticated: false } });
  assert.deepEqual(await currentStatus, { authenticated: false });
  await bridge.stop();
});

function fakeChild(sent) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.send = (message, callback) => {
    sent.push(message);
    callback?.(null);
    if (message.op === 'shutdown') setImmediate(() => child.emit('exit', 0));
  };
  child.kill = () => child.emit('exit', 1);
  return child;
}
