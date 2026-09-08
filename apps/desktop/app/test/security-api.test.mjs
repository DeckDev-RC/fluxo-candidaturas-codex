import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('secure server issues a local session and requires CSRF for mutations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-secure-api-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  const server = createServer({ rootDir: root, requireSession: true });
  const address = await listen(server);
  try {
    const bootstrap = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/session`);
    const session = await bootstrap.json();
    const cookie = bootstrap.headers.get('set-cookie')?.split(';')[0];
    assert.equal(bootstrap.status, 200);
    assert.match(session.csrfToken, /^[0-9a-f]{64}$/);
    assert.ok(cookie?.startsWith('fluxo_session='));
    assert.match(bootstrap.headers.get('content-security-policy'), /default-src 'self'/);

    const unauthorized = await fetch(`http://127.0.0.1:${address.port}/api/v1/state`);
    assert.equal(unauthorized.status, 401);
    const csrfMissing = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'campaign' }) });
    assert.equal(csrfMissing.status, 403);
    const authorized = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs`, { method: 'POST', headers: { cookie, 'x-fluxo-csrf': session.csrfToken, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'campaign' }) });
    assert.equal(authorized.status, 201);
    const envelope = await authorized.json();
    assert.match(envelope.request_id, /^[0-9a-f-]{36}$/);
    assert.ok(Array.isArray(envelope.event_ids));
    assert.ok('state' in envelope);
    const invalid = await fetch(`http://127.0.0.1:${address.port}/api/v1/queue/items`, { method: 'POST', headers: { cookie, 'x-fluxo-csrf': session.csrfToken, 'content-type': 'application/json' }, body: '{}' });
    const invalidBody = await invalid.json();
    assert.equal(invalid.status, 400);
    assert.equal(invalidBody.error.request_id, invalid.headers.get('x-request-id'));
    assert.equal(invalidBody.error.retryable, false);
  } finally { await close(server); }
});

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
