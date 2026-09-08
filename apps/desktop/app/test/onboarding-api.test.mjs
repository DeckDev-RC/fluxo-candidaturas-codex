import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('onboarding API validates and saves the local profile setup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-onboarding-api-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  let received = null;
  const server = createServer({
    rootDir: root,
    onboardingService: {
      async saveOnboarding(input) { received = input; return { ready: true, profilePath: 'perfil/candidato.md' }; }
    }
  });
  const address = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/onboarding`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Pessoa Teste' })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ready, true);
    assert.equal(received.name, 'Pessoa Teste');
  } finally {
    await close(server);
  }
});

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
