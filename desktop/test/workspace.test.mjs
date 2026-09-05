import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeWorkspace, validateWorkspaceLocation } from '../workspace.mjs';

test('initialization copies public runtime resources and preserves existing private data', async () => {
  const base = await mkdtemp(join(tmpdir(), 'fluxo-desktop-workspace-'));
  const source = join(base, 'bundle'); const root = join(base, 'data');
  await mkdir(join(source, 'scripts'), { recursive: true });
  await mkdir(join(root, 'perfil'), { recursive: true });
  await writeFile(join(source, 'scripts', 'preflight.ps1'), '# diagnostic');
  await writeFile(join(source, '.env.example'), 'REQUIRE_FINAL_CONFIRMATION=true');
  await writeFile(join(source, '.env'), 'PRIVATE_MUST_NOT_COPY=secret');
  await writeFile(join(root, 'perfil', 'candidato.md'), 'perfil existente');
  await initializeWorkspace({ rootDir: root, bundleRoot: source });
  await initializeWorkspace({ rootDir: root, bundleRoot: source });
  assert.equal(await readFile(join(root, 'perfil', 'candidato.md'), 'utf8'), 'perfil existente');
  assert.equal(await readFile(join(root, 'scripts', 'preflight.ps1'), 'utf8'), '# diagnostic');
  assert.equal(await readFile(join(root, '.env'), 'utf8'), 'REQUIRE_FINAL_CONFIRMATION=true');
});

test('data directory cannot be placed inside the install bundle', () => {
  assert.throws(() => validateWorkspaceLocation('C:/Apps/Fluxo/data', 'C:/Apps/Fluxo'), { code: 'workspace_inside_installation' });
  assert.equal(validateWorkspaceLocation('C:/Users/Test/Fluxo', 'C:/Apps/Fluxo'), true);
});
