import test from 'node:test';
import assert from 'node:assert/strict';
import { createObservability } from '../src/observability.mjs';
import { isLocalRequest } from '../src/local-auth.mjs';
import { createServer } from '../src/http-server.mjs';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('local auth accepts loopback and same-origin requests only', () => {
  assert.equal(isLocalRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }), true);
  assert.equal(isLocalRequest({ socket: { remoteAddress: '10.0.0.4' }, headers: {} }), false);
  assert.equal(isLocalRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: { origin: 'https://evil.test' } }), false);
  assert.equal(isLocalRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: { origin: 'http://localhost.evil.test' } }), false);
  assert.equal(isLocalRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: { origin: 'http://127.0.0.1.evil.test' } }), false);
  assert.equal(isLocalRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: { origin: 'http://localhost:4173' } }), true);
  assert.equal(isLocalRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: { origin: 'http://127.0.0.1:4173' } }), true);
});

test('observability records sanitized request outcomes and counters', () => {
  const service = createObservability({ maxEntries: 2 });
  service.record({ method: 'POST', path: '/api/v1/secret', status: 400, durationMs: 3 });
  service.record({ method: 'GET', path: '/api/v1/state', status: 200, durationMs: 1 });
  service.record({ method: 'GET', path: '/api/v1/profile', status: 200, durationMs: 2 });
  const snapshot = service.snapshot();
  assert.equal(snapshot.requests, 3);
  assert.equal(snapshot.errors, 1);
  assert.equal(snapshot.recent.length, 2);
  assert.equal(JSON.stringify(snapshot).includes('password'), false);
});

test('auth session endpoint documents the local authentication boundary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-auth-api-')); await mkdir(join(root, 'estado'), { recursive: true });
  const server = createServer({ rootDir: root });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/session`); const session = await response.json(); assert.equal(session.authenticated, true); assert.equal(session.mode, 'loopback'); assert.match(session.csrfToken, /^[0-9a-f]{64}$/); }
  finally { await new Promise((resolve) => server.close(resolve)); }
});
