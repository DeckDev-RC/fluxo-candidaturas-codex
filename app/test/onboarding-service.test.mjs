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

test('onboarding persists campaign period, exclusions and selection filters', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-onboarding-filters-'));
  await mkdir(join(root, 'config'), { recursive: true });
  await writeFile(join(root, 'config', 'plataformas.json'), JSON.stringify({ platforms: [{ name: 'GUPY' }] }));
  const input = validInput();
  input.campaign = { ...input.campaign, periodStart: '2026-09-01', periodEnd: '2026-09-30', exclusions: ['estágio'], filters: { roles: ['backend'], seniority: ['pleno'] } };
  await createOnboardingService({ rootDir: root }).saveOnboarding(input);
  const campaign = JSON.parse(await readFile(join(root, 'campanha', 'config.json'), 'utf8'));
  assert.equal(campaign.periodStart, '2026-09-01');
  assert.deepEqual(campaign.exclusions, ['estágio']);
  assert.deepEqual(campaign.filters.roles, ['backend']);
});

test('onboarding protects direct profile writes with its mutation lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-onboarding-lock-')); await mkdir(join(root, 'config'), { recursive: true }); await writeFile(join(root, 'config', 'plataformas.json'), JSON.stringify({ platforms: [{ name: 'GUPY' }] })); let acquired = 0;
  await createOnboardingService({ rootDir: root, lock: async () => { acquired += 1; return async () => {}; } }).saveOnboarding(validInput());
  assert.equal(acquired, 1);
});

test('onboarding keeps a backup before replacing the private profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-onboarding-backup-')); await mkdir(join(root, 'config'), { recursive: true }); await writeFile(join(root, 'config', 'plataformas.json'), JSON.stringify({ platforms: [{ name: 'GUPY' }] })); const service = createOnboardingService({ rootDir: root });
  await service.saveOnboarding(validInput()); await service.saveOnboarding({ ...validInput(), name: 'Outro' });
  await (await import('node:fs/promises')).access(join(root, 'perfil', 'candidato.md.bak'));
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
