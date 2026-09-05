import { access, mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

test('package exposes the local app entrypoint', async () => {
  const packageJson = JSON.parse(await readFile(join(import.meta.dirname, '..', 'package.json'), 'utf8'));

  assert.equal(packageJson.scripts.start, 'node --disable-warning=ExperimentalWarning src/main.mjs');
});

test('startup listens locally, honors FLUXO_ROOT and shuts down cleanly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-startup-'));
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/main.mjs'], {
    cwd: join(import.meta.dirname, '..'),
    env: { ...process.env, FLUXO_ROOT: root, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  try {
    await waitFor(() => stdout.includes('Fluxo app disponível em http://127.0.0.1:'));
    const port = Number(stdout.match(/127\.0\.0\.1:(\d+)/)?.[1]);
    assert.ok(port > 0);
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
    await access(join(root, 'estado'));

    child.kill('SIGTERM');
    const exit = await waitForExit(child);
    assert.ok(exit.code === 0 || exit.signal === 'SIGTERM', `${stderr} (${JSON.stringify(exit)})`);
  } finally {
    await stopChild(child);
  }
});

test('execution contract documents the supported local modes and safety boundaries', async () => {
  const contract = await readFile(join(import.meta.dirname, '..', '..', 'docs', 'CONTRATO-DE-EXECUCAO.md'), 'utf8');
  for (const phrase of [
    'Node.js', '>= 24', 'PowerShell', 'npx', 'Codex CLI', 'Playwright',
    '127.0.0.1:4173', 'FLUXO_ROOT', 'PORT', 'chatgpt', 'api-key',
    'fixture', 'offline', 'representa candidatura real',
    'Codex', 'Playwright', 'internet', 'estado/', 'não devem ser compartilhados'
  ]) assert.match(contract, new RegExp(phrase.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&'), 'i'));
});

function waitFor(predicate, timeoutMs = 5000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - startedAt >= timeoutMs) return reject(new Error('timeout waiting for startup'));
      setTimeout(check, 25);
    };
    check();
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await waitForExit(child);
}
