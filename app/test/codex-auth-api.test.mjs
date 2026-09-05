import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('local API exposes ChatGPT OAuth status, browser login and logout without credential material', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-codex-auth-api-'));
  const calls = [];
  const authService = { async status() { return { status: 'signed_out', authenticated: false, method: 'none', message: 'Faça login' }; }, startLogin(input) { calls.push(input); return { status: 'starting', authenticated: false, method: 'chatgpt', message: 'O navegador será aberto' }; }, async logout() { return { status: 'signed_out', authenticated: false, method: 'none', message: 'Sessão removida' }; } };
  const server = createServer({ rootDir: root, requireSession: false, authService });
  const address = await listen(server);
  try {
    const status = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/openai`);
    assert.equal(status.status, 200);
    assert.equal((await status.json()).authenticated, false);
    const login = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/openai/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device: true }) });
    assert.equal(login.status, 202);
    assert.equal((await login.json()).data.status, 'starting');
    assert.deepEqual(calls[0], { device: true });
    const logout = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/openai/logout`, { method: 'POST' });
    assert.equal(logout.status, 200);
    assert.equal(JSON.stringify(await logout.json()).includes('token'), false);
  } finally { await close(server); }
});

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
