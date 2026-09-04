import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignService } from '../src/campaign-service.mjs';

test('campaign service reads and updates goals without credentials', async () => {
  const root = await fixtureRoot();
  const service = createCampaignService({ rootDir: root });

  const updated = await service.updateCampaign({ totalGoal: 3, dailyGoal: 1, platforms: [{ name: 'GUPY', enabled: true, goal: 3 }] });
  const saved = JSON.parse(await readFile(join(root, 'campanha', 'config.json'), 'utf8'));

  assert.equal(updated.totalGoal, 3);
  assert.equal(saved.platforms[0].goal, 3);
  assert.equal(JSON.stringify(updated).includes('private-password'), false);
});

test('campaign service rejects negative goals and unknown platforms', async () => {
  const root = await fixtureRoot();
  const service = createCampaignService({ rootDir: root });

  await assert.rejects(() => service.updateCampaign({ totalGoal: -1 }), (error) => error.code === 'invalid_campaign');
  await assert.rejects(() => service.updateCampaign({ platforms: [{ name: 'UNKNOWN', enabled: true, goal: 1 }] }), (error) => error.code === 'invalid_platform');
});

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-campaign-'));
  await mkdir(join(root, 'campanha'), { recursive: true });
  await mkdir(join(root, 'config'), { recursive: true });
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ totalGoal: 2, dailyGoal: 1, weeklyGoal: 2, platforms: [{ name: 'GUPY', enabled: true, goal: 2 }] }));
  await writeFile(join(root, 'config', 'plataformas.json'), JSON.stringify({ platforms: [{ name: 'GUPY', urlEnv: 'GUPY_URL', goalEnv: 'GUPY_GOAL' }] }));
  await writeFile(join(root, '.env'), 'GUPY_PASSWORD=private-password');
  return root;
}
