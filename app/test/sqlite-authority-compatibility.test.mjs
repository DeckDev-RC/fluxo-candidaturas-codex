import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeNewFluxoPersistence } from '../src/persistence-authority.mjs';
import { createOnboardingService } from '../src/onboarding-service.mjs';
import { createPendingService } from '../src/pending-service.mjs';
import { createMetricsService } from '../src/metrics-service.mjs';
import { runAllowedScript } from '../src/script-adapter.mjs';

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
    await assert.rejects(() => runAllowedScript('nova-candidatura.ps1', [], { rootDir: root, persistence }), (error) => error.code === 'legacy_script_blocked' && error.message.includes('SQLite'));
  } finally { persistence.close(); }
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-sqlite-compat-'));
  await mkdir(join(root, 'config'), { recursive: true });
  await writeFile(join(root, 'config', 'plataformas.json'), JSON.stringify({ platforms: [{ name: 'GUPY' }] }));
  return root;
}
function onboardingInput() {
  return { name: 'Pessoa Teste', email: 'ana@example.com', phone: '11', location: 'SP', targetRoles: 'Dev', seniority: 'Pleno', technicalFocus: 'JS', workModes: 'Remoto', acceptedLocations: 'Brasil', contracts: 'CLT', minimumSalary: '1', availability: 'Agora', education: 'Superior', languages: 'PT', professionalSummary: 'Resumo', strengths: 'Força', workAuthorization: 'Sim', travel: 'Não', pcd: 'Não', campaign: { totalGoal: 1, dailyGoal: 1, weeklyGoal: 1, platforms: [{ name: 'GUPY', enabled: true, goal: 1 }] } };
}
