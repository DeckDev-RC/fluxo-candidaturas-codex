import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeNewFluxoPersistence } from '../src/persistence-authority.mjs';
import { createOnboardingService } from '../src/onboarding-service.mjs';
import { createPendingService } from '../src/pending-service.mjs';
import { createMetricsService } from '../src/metrics-service.mjs';
import { runAllowedScript } from '../src/script-adapter.mjs';
import { createAssessmentService } from '../src/assessment-service.mjs';
import { createEvidenceService } from '../src/evidence-service.mjs';
import { createLegacyImportService } from '../src/legacy-import-service.mjs';

test('onboarding, pending and metrics read SQLite authority without creating operational JSON', async () => {
  const root = await fixture();
  const persistence = await initializeNewFluxoPersistence({ rootDir: root });
  try {
    const input = onboardingInput();
    await createOnboardingService({ rootDir: root, persistence, mutationLock: false }).saveOnboarding(input);
    await persistence.replaceApplications([{ id: 'app-1', key: 'GUPY|1', status: 'enviada', nextAction: 'Responder', nextActionAt: '2026-09-05T12:00:00Z', evidence: ['evidencias/a.png'] }]);
    const pending = await createPendingService({ rootDir: root, persistence }).list({ dueWithinDays: 7 });
    const metrics = await createMetricsService({ rootDir: root, persistence }).get();
    assert.equal(pending[0].id, 'app-1');
    assert.equal(metrics.totals.applications, 1);
    assert.equal(metrics.totals.evidenceCoverage, 100);
  } finally { persistence.close(); }
});

test('mutating legacy scripts are blocked after SQLite migration with an actionable error', async () => {
  const root = await fixture();
  const persistence = await initializeNewFluxoPersistence({ rootDir: root });
  try {
    for (const name of ['nova-candidatura.ps1', 'adicionar-vaga.ps1', 'onboarding.ps1', 'primeiro-uso.ps1']) {
      await assert.rejects(() => runAllowedScript(name, [], { rootDir: root, persistence }), (error) => error.code === 'legacy_script_blocked' && error.message.includes('SQLite'));
    }
  } finally { persistence.close(); }
});

test('SQLite rejects normal writes when a compatibility JSON was edited externally', async () => {
  const root = await fixture();
  const persistence = await initializeNewFluxoPersistence({ rootDir: root });
  try {
    await persistence.exportCompatibility();
    await writeFile(join(root, 'fila', 'vagas.json'), '[{"id":"outside"}]\n');
    await assert.rejects(() => persistence.saveCampaign({ platforms: [] }), (error) => error.code === 'legacy_drift');
  } finally { persistence.close(); }
});

test('preflight receives an SQLite compatibility export and refuses to overwrite drift', async () => {
  const root = await fixture();
  await mkdir(join(root, 'scripts'), { recursive: true });
  await writeFile(join(root, 'scripts', 'preflight.ps1'), "Get-Content (Join-Path $PSScriptRoot '../campanha/config.json') -Raw");
  const persistence = await initializeNewFluxoPersistence({ rootDir: root });
  try {
    await persistence.saveCampaign({ id: 'sqlite', platforms: [] });
    const observed = await runAllowedScript('preflight.ps1', [], { rootDir: root, persistence });
    assert.equal(JSON.parse(observed.stdout).id, 'sqlite');
    await mkdir(join(root, 'campanha'), { recursive: true });
    await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ id: 'external', platforms: [] }));
    await assert.rejects(() => runAllowedScript('preflight.ps1', [], { rootDir: root, persistence }), (error) => error.code === 'legacy_drift');
  } finally { persistence.close(); }
});

test('assessment, evidence and legacy imports use the SQLite bridge through isolated legacy execution', async () => {
  const root = await fixture();
  await mkdir(join(root, 'evidencias'), { recursive: true });
  await mkdir(join(root, 'legado'), { recursive: true });
  await writeFile(join(root, 'evidencias', 'result.png'), 'image');
  await writeFile(join(root, 'legado', 'controle_candidaturas_gupy.md'), '| ID da vaga | Empresa | Vaga | Status | Retorno |\n|---|---|---|---|---|\n| legacy-1 | Empresa | Dev | Enviada | OK |\n');
  const persistence = await initializeNewFluxoPersistence({ rootDir: root });
  try {
    await persistence.replaceApplications([{ id: 'app-1', key: 'GUPY|app-1', platform: 'GUPY', company: 'Empresa', role: 'Dev', identifierOrUrl: 'app-1', status: 'teste pendente', evidence: [], history: [] }]);
    await createAssessmentService({ rootDir: root, persistence }).record({ reference: 'app-1', testName: 'Técnico', score: '9', total: '10' });
    await createEvidenceService({ rootDir: root, persistence }).record({ sourcePath: 'evidencias/result.png', reference: 'app-1', type: 'teste' });
    const imported = await createLegacyImportService({ rootDir: root, persistence }).import({ directory: 'legado' });
    const applications = await persistence.getApplications();
    assert.equal(applications.find((item) => item.id === 'app-1').assessment.score, '9');
    assert.equal(applications.find((item) => item.id === 'app-1').evidence.length, 1);
    assert.equal(imported.imported, 1);
    assert.equal(applications.some((item) => item.identifierOrUrl === 'legacy-1'), true);
  } finally { persistence.close(); }
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-sqlite-compat-'));
  await cp(new URL('../../scripts/', import.meta.url), join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'config'), { recursive: true });
  await writeFile(join(root, 'config', 'plataformas.json'), JSON.stringify({ platforms: [{ name: 'GUPY' }] }));
  return root;
}
function onboardingInput() {
  return { name: 'Pessoa Teste', email: 'ana@example.com', phone: '11', location: 'SP', targetRoles: 'Dev', seniority: 'Pleno', technicalFocus: 'JS', workModes: 'Remoto', acceptedLocations: 'Brasil', contracts: 'CLT', minimumSalary: '1', availability: 'Agora', education: 'Superior', languages: 'PT', professionalSummary: 'Resumo', strengths: 'Força', workAuthorization: 'Sim', travel: 'Não', pcd: 'Não', campaign: { totalGoal: 1, dailyGoal: 1, weeklyGoal: 1, platforms: [{ name: 'GUPY', enabled: true, goal: 1 }] } };
}
