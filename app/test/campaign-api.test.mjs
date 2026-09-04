import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('campaign API reads registry and updates campaign goals', async () => {
  const root = await fixtureRoot();
  const server = createServer({ rootDir: root });
  const address = await listen(server);

  try {
    const platforms = await fetchJson(address, '/api/v1/platforms');
    const updated = await fetchJson(address, '/api/v1/campaign', 'PUT', { totalGoal: 4 });
    const saved = JSON.parse(await readFile(join(root, 'campanha', 'config.json'), 'utf8'));

    assert.equal(platforms[0].name, 'GUPY');
    assert.equal(updated.totalGoal, 4);
    assert.equal(saved.totalGoal, 4);
  } finally {
    await close(server);
  }
});

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-campaign-api-'));
  await mkdir(join(root, 'campanha'), { recursive: true });
  await mkdir(join(root, 'config'), { recursive: true });
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ totalGoal: 2, platforms: [{ name: 'GUPY', enabled: true, goal: 2 }] }));
  await writeFile(join(root, 'config', 'plataformas.json'), JSON.stringify({ platforms: [{ name: 'GUPY', urlEnv: 'GUPY_URL', goalEnv: 'GUPY_GOAL' }] }));
  return root;
}

async function fetchJson(address, path, method = 'GET', body) {
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
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
