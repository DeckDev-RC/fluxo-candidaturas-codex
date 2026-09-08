import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { getFluxoProfileSummary } from '../src/profile-service.mjs';

test('profile summary exposes only local presence and resume metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-profile-'));
  await mkdir(join(root, 'perfil'), { recursive: true });
  await mkdir(join(root, 'curriculo'), { recursive: true });
  await writeFile(join(root, 'perfil', 'candidato.md'), '# Pessoa Teste\nemail: private@example.test');
  await writeFile(join(root, 'curriculo', 'backend.pdf'), 'private resume content');

  const summary = await getFluxoProfileSummary(root);

  assert.equal(summary.profile.exists, true);
  assert.equal(summary.resumes[0].name, 'backend.pdf');
  assert.equal(JSON.stringify(summary).includes('private@example.test'), false);
  assert.equal(JSON.stringify(summary).includes('private resume content'), false);
});

test('profile summary returns safe empty defaults when private files are absent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-profile-'));

  const summary = await getFluxoProfileSummary(root);

  assert.equal(summary.profile.exists, false);
  assert.deepEqual(summary.resumes, []);
});
