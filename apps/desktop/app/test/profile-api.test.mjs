import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('profile and state detail endpoints expose safe local summaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-profile-api-'));
  for (const directory of ['estado', 'perfil', 'curriculo']) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, 'perfil', 'candidato.md'), 'private profile');
  await writeFile(join(root, 'curriculo', 'cv.pdf'), 'private resume');
  await writeFile(join(root, 'estado', 'preflight.json'), JSON.stringify({ ready: true, checks: [] }));
  await writeFile(join(root, 'estado', 'checkpoint.json'), JSON.stringify({ phase: 'fila' }));
  const server = createServer({ rootDir: root });
  const address = await listen(server);

  try {
    const profile = await fetchJson(address, '/api/v1/profile');
    const preflight = await fetchJson(address, '/api/v1/state/preflight');
    const checkpoint = await fetchJson(address, '/api/v1/state/checkpoint');
    const serialized = JSON.stringify(profile);

    assert.equal(profile.profile.exists, true);
    assert.equal(profile.resumes[0].name, 'cv.pdf');
    assert.equal(preflight.ready, true);
    assert.equal(checkpoint.phase, 'fila');
    assert.equal(serialized.includes('private profile'), false);
  } finally {
    await close(server);
  }
});

async function fetchJson(address, path) {
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
  assert.equal(response.ok, true);
  return response.json();
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
