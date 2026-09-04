import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnboardingService, validateOnboarding } from '../src/onboarding-service.mjs';

test('validateOnboarding requires the facts needed before campaign work', () => {
  const result = validateOnboarding({ name: 'Pessoa Teste', email: 'pessoa@example.test' });

  assert.equal(result.valid, false);
  assert.equal(result.missing.includes('targetRoles'), true);
  assert.equal(result.missing.includes('campaign'), true);
});

test('onboarding service writes profile and campaign without credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-onboarding-'));
  await mkdir(join(root, 'config'), { recursive: true });
  await writeFile(join(root, 'config', 'plataformas.json'), JSON.stringify({ platforms: [{ name: 'GUPY' }] }));
  const service = createOnboardingService({ rootDir: root });
  const input = validInput();

  const result = await service.saveOnboarding(input);
  const profile = await readFile(join(root, 'perfil', 'candidato.md'), 'utf8');
  const campaign = JSON.parse(await readFile(join(root, 'campanha', 'config.json'), 'utf8'));

  assert.equal(result.ready, true);
  assert.match(profile, /Nome completo: Pessoa Teste/);
  assert.equal(campaign.totalGoal, 10);
  assert.equal(profile.includes('PASSWORD'), false);
});

function validInput() {
  return {
    name: 'Pessoa Teste', email: 'pessoa@example.test', phone: '11900000000', location: 'Goiânia/GO',
    targetRoles: 'Desenvolvedor Backend', seniority: 'Pleno', technicalFocus: 'Python, APIs',
    workModes: 'remoto', acceptedLocations: 'Brasil', contracts: 'CLT/PJ', minimumSalary: '5000', availability: 'imediata',
    education: 'Tecnologia', languages: 'Português', professionalSummary: 'Desenvolvedor', strengths: 'Python',
    workAuthorization: 'Brasil', travel: 'não', pcd: 'prefiro não informar',
    campaign: { totalGoal: 10, dailyGoal: 2, weeklyGoal: 10, deadline: '', platforms: [{ name: 'GUPY', enabled: true, goal: 10 }] }
  };
}
