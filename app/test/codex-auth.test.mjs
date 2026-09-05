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

// Achado do teste de usabilidade: um login que espera o navegador não pode segurar a
// trava de dados — enquanto ele esperava, qualquer outra ação recebia "fluxo_locked".
test('login do ChatGPT em andamento não bloqueia outras mutações do Fluxo', async () => {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createServer } = await import('../src/http-server.mjs');
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-login-lock-'));
  let liberarLogin;
  const authService = {
    status: async () => ({ status: 'signed_out', authenticated: false }),
    startLogin: () => new Promise((resolve) => { liberarLogin = () => resolve({ status: 'awaiting_user', authUrl: 'https://auth.openai.com/oauth' }); }),
    logout: async () => ({ status: 'signed_out' })
  };
  const server = createServer({ rootDir, authService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = fetch(`${base}/api/v1/auth/openai/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const outra = await fetch(`${base}/api/v1/state/checkpoint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stage: 'teste' }) });
    assert.notEqual(outra.status, 409, 'o login em andamento não pode travar o resto do Fluxo');
    liberarLogin();
    const resposta = await login;
    assert.equal(resposta.status, 202);
    assert.equal((await resposta.json()).authUrl, 'https://auth.openai.com/oauth');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
