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

// Achado da auditoria: o `exit` tardio de um worker morto por timeout zerava o
// estado do worker novo e chamava onExit (tela de diagnóstico sem motivo).
test('a saída tardia de um worker antigo não afeta o novo; stop espera o filho sair de verdade', async () => {
  const filhos = [];
  const saidas = [];
  const novoFilho = () => {
    const filho = new EventEmitter();
    filho.mortes = 0;
    filho.kill = () => { filho.mortes += 1; };
    filho.postMessage = () => { /* ignora o shutdown: precisa ser morto */ };
    filhos.push(filho);
    queueMicrotask(() => filho.emit('message', { type: 'ready', url: `http://127.0.0.1:${4000 + filhos.length}` }));
    return filho;
  };
  const service = createSupervisor({ launch: novoFilho, killTimeoutMs: 30, onExit: (code) => saidas.push(code) });
  await service.start();
  const antigo = filhos[0];
  const parada = service.stop();
  await new Promise((r) => setTimeout(r, 90));
  await parada;
  assert.equal(antigo.mortes, 1, 'sem resposta ao shutdown, o filho é morto');
  const novo = await service.start();
  assert.equal(novo.url, 'http://127.0.0.1:4002');
  // O antigo só agora sai: nada muda para o novo e onExit não é chamado.
  antigo.emit('exit', 1);
  assert.deepEqual(saidas, []);
  assert.equal((await service.start()).url, 'http://127.0.0.1:4002', 'o novo continua registrado');
  // Crash real do novo chama onExit com o código.
  filhos[1].emit('exit', 7);
  assert.deepEqual(saidas, [7]);
});

test('erro do utility process depois de pronto não derruba o principal', async () => {
  const child = new EventEmitter(); child.kill = () => {}; child.postMessage = () => {};
  const service = createSupervisor({ launch: () => { queueMicrotask(() => child.emit('message', { type: 'ready', url: 'http://127.0.0.1:4173' })); return child; } });
  await service.start();
  assert.doesNotThrow(() => child.emit('error', new Error('falha interna')));
});

test('startup crash rejects rather than displaying a working application', async () => {
  const child = new EventEmitter(); child.kill = () => {};
  const service = createSupervisor({ launch: () => { queueMicrotask(() => child.emit('exit', 1)); return child; } });
  await assert.rejects(service.start(), { code: 'backend_start_failed' });
});
