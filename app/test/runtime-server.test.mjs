import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeServer } from '../src/runtime-server.mjs';

test('runtime server starts the composed local harness without launching browser or agent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-server-'));
  for (const directory of ['estado', 'campanha', 'fila', 'candidaturas']) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ platforms: [] }));
  await writeFile(join(root, 'fila', 'vagas.json'), '[]');
  await writeFile(join(root, 'candidaturas', 'candidaturas.json'), '[]');
  const runtime = await createRuntimeServer({ rootDir: root, port: 0 });

  try {
    await listen(runtime.server);
    const address = runtime.server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.equal(typeof runtime.runtime.applicationFlow.prepareNext, 'function');
  } finally {
    await close(runtime.server);
    await runtime.runtime.close();
  }
});

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
