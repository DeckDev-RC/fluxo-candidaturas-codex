import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShareableExport } from '../src/export-service.mjs';

test('createShareableExport runs the sanitized Fluxo distribution flow', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-export-'));
  await createDistributionFixture(root);

  const result = await createShareableExport({ rootDir: root });

  assert.equal(result.exitCode, 0);
  assert.equal(result.ok, true);
  assert.match(result.stdout, /Pacote distribu.*vel criado em/);
  assert.equal(result.stdout.includes('candidate-secret.pdf'), false);
});

async function createDistributionFixture(root) {
  for (const directory of ['config', 'docs', 'templates', 'scripts', 'perfil', 'curriculo', 'candidaturas', 'campanha', 'fila', 'estado', 'evidencias', 'mensagens', 'dist']) {
    await mkdir(join(root, directory), { recursive: true });
  }
  for (const file of ['AGENTS.md', 'README.md', 'VERSION', 'CHANGELOG.md', '.env.example', '.gitignore', '.gitattributes']) {
    await writeFile(join(root, file), file === 'VERSION' ? '1.0.0' : `safe ${file}`);
  }
  await writeFile(join(root, 'scripts', 'exportar-compartilhavel.ps1'), await importExistingExporter());
  for (const directory of ['config', 'docs', 'templates', 'scripts']) {
    if (directory !== 'scripts') await writeFile(join(root, directory, 'README.md'), `safe ${directory}`);
  }
  for (const directory of ['perfil', 'curriculo', 'candidaturas', 'campanha', 'fila', 'estado', 'evidencias', 'mensagens']) {
    await writeFile(join(root, directory, 'README.md'), `safe ${directory}`);
  }
  await writeFile(join(root, 'curriculo', 'candidate-secret.pdf'), 'private');
  await writeFile(join(root, 'candidaturas', 'candidaturas.json'), 'private');
  await writeFile(join(root, '.env'), 'GUPY_PASSWORD=private');
}

async function importExistingExporter() {
  const currentWorktree = join(process.cwd(), '..');
  return (await import('node:fs/promises')).readFile(join(currentWorktree, 'scripts', 'exportar-compartilhavel.ps1'), 'utf8');
}
