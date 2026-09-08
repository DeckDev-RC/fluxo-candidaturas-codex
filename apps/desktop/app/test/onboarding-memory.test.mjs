import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOnboardingService } from '../src/onboarding-service.mjs';

test('onboarding confirms reusable profile facts in memory after saving the local setup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-onboarding-memory-'));
  for (const directory of ['config', 'perfil', 'campanha', 'fila', 'candidaturas']) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, 'config', 'plataformas.json'), JSON.stringify({ platforms: [{ name: 'GUPY' }] }));
  let facts;
  const service = createOnboardingService({ rootDir: root, mutationLock: false, memoryService: { async upsertFacts(value) { facts = value; } } });
  await service.saveOnboarding({ name: 'Pessoa Teste', email: 'ana@example.com', phone: '000', location: 'Remoto', targetRoles: 'Backend', seniority: 'Pleno', technicalFocus: 'Node.js', workModes: 'Remoto', acceptedLocations: 'Brasil', contracts: 'CLT', minimumSalary: '5000', availability: 'imediata', education: 'Computação', languages: 'Português', workAuthorization: 'Sim', travel: 'Não', pcd: 'Não', professionalSummary: 'Backend', strengths: 'Entrega', campaign: { totalGoal: 1, dailyGoal: 1, weeklyGoal: 1, platforms: [{ name: 'GUPY', enabled: true, goal: 1 }] } });
  assert.equal(facts.find((fact) => fact.key === 'targetRoles').value, 'Backend');
  assert.equal(facts.find((fact) => fact.key === 'targetRoles').source, 'onboarding');
});
