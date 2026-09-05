import { EventEmitter } from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexAuthService } from '../src/codex-auth-service.mjs';

test('Codex auth reports ChatGPT login without exposing tokens and starts browser/device OAuth in background', async () => {
  const calls = [];
  const service = createCodexAuthService({
    execute: async (args) => { calls.push(args); return { ok: true, stdout: args[0] === 'login' ? 'Logged in using ChatGPT' : 'Logged out' }; }
  });
  const status = await service.status();
  assert.equal(status.authenticated, true);
  assert.equal(status.method, 'chatgpt');
  assert.equal('accessToken' in status, false);
  const started = service.startLogin({ device: true });
  assert.equal(started.status, 'starting');
  assert.equal(calls[1][0], 'login');
  assert.deepEqual(calls[1].slice(1), ['--device-auth']);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await service.status()).authenticated, true);
  await service.logout();
  assert.equal(calls.at(-1)[0], 'logout');
});

test('Codex auth background runner exposes a safe manual fallback when OAuth cannot start', async () => {
  const service = createCodexAuthService({ execute: async () => ({ ok: false, stderr: 'browser unavailable', stdout: '' }) });
  const started = service.startLogin();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started.status, 'error');
  assert.match(started.message, /OAuth|login/i);
  assert.equal('stderr' in started, false);
});

test('Codex auth can use a local status process abstraction', async () => {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  const service = createCodexAuthService({ spawnLogin: () => child, execute: async () => ({ ok: true, stdout: 'Logged in using ChatGPT' }) });
  const started = service.startLogin();
  child.stdout.emit('data', 'Open browser to continue'); child.emit('close', 0);
  assert.equal(started.status, 'authenticated');
});

test('Codex auth starts the official app-server ChatGPT OAuth flow and returns browser/device instructions', async () => {
  const calls = [];
  const service = createCodexAuthService({ agentAdapter: { async request(method, params) { calls.push([method, params]); return params.type === 'chatgptDeviceCode' ? { type: 'chatgptDeviceCode', loginId: 'login-1', userCode: 'ABCD-EFGH', verificationUrl: 'https://auth.openai.com/device' } : { type: 'chatgpt', loginId: 'login-2', authUrl: 'https://auth.openai.com/oauth' }; } } });
  const browser = await service.startLogin();
  const device = await service.startLogin({ device: true });
  assert.equal(browser.authUrl, 'https://auth.openai.com/oauth');
  assert.equal(device.userCode, 'ABCD-EFGH');
  assert.equal(device.verificationUrl, 'https://auth.openai.com/device');
  assert.deepEqual(calls.map(([method]) => method), ['account/login/start', 'account/login/start']);
  assert.equal(calls[0][1].type, 'chatgpt');
});
