import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeWorkspace } from '../desktop/workspace.mjs';

// O pacote é o repositório deste arquivo, não o diretório de onde o teste foi chamado.
const BUNDLE_ROOT = fileURLToPath(new URL('../', import.meta.url));
import { initializeNewFluxoPersistence } from '../app/src/persistence-authority.mjs';
import { runPreflight } from '../app/src/preflight-service.mjs';

test('real PowerShell preflight validates SQLite campaign without creating competing JSON authority', { timeout: 60_000 }, async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-preflight-sqlite-'));
  await initializeWorkspace({ rootDir, bundleRoot: BUNDLE_ROOT });
  await writeFile(join(rootDir, 'perfil', 'candidato.md'), '# Perfil sintético\n' + 'Pessoa fictícia para validação de ambiente local. '.repeat(12));
  await writeFile(join(rootDir, 'curriculo', 'fixture.pdf'), '%PDF-1.4 arquivo sintético usado somente para validar presença no preflight');
  const persistence = await initializeNewFluxoPersistence({ rootDir });
  try {
    await persistence.saveCampaign({ totalGoal: 1, dailyGoal: 1, weeklyGoal: 1, platforms: [{ name: 'GUPY', enabled: true, goal: 1 }] });
    const result = await runPreflight({ rootDir, skipPlaywright: true });
    assert.equal(result.ok, true, result.stderr || result.stdout);
    const report = JSON.parse(await readFile(join(rootDir, 'estado', 'preflight.json'), 'utf8'));
    assert.equal(report.ready, true);
    assert.deepEqual(await persistence.detectLegacyDrift(), []);
    assert.equal((await persistence.getCampaign()).totalGoal, 1);
  } finally { persistence.close(); }
});
