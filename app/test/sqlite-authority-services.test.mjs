import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeNewFluxoPersistence } from '../src/persistence-authority.mjs';
import { createCampaignService } from '../src/campaign-service.mjs';
import { createQueueService } from '../src/queue-service.mjs';
import { createApplicationService } from '../src/application-service.mjs';
import { createFollowUpService } from '../src/follow-up-service.mjs';
import { readFluxoState } from '../src/state-reader.mjs';

test('SQLite authority routes campaign, queue, confirmed application and follow-up without calling legacy scripts', async () => {
  const root = await fixture();
  const persistence = await initializeNewFluxoPersistence({ rootDir: root });
  const scripts = [];
  try {
    await createCampaignService({ rootDir: root, persistence }).updateCampaign({ totalGoal: 2, platforms: [{ name: 'GUPY', enabled: true, goal: 2 }] });
    const queue = createQueueService({ rootDir: root, persistence, checkpointAfterEachAction: false });
    const item = await queue.addQueueItem({ platform: 'GUPY', company: 'Fluxo', role: 'Developer', identifierOrUrl: 'https://jobs/1', priority: 'A' });
    const record = await createApplicationService({ rootDir: root, persistence, scriptRunner: async (...args) => { scripts.push(args); return { ok: false }; } }).recordConfirmedApplication({ item, confirmation: { confirmed: true }, evidencePath: 'evidencias/confirmacao.png', applicationId: 'remote-1' });
    const repeated = await createApplicationService({ rootDir: root, persistence }).recordConfirmedApplication({ item, confirmation: { confirmed: true }, evidencePath: 'evidencias/confirmacao.png', applicationId: 'remote-1' });
    await createFollowUpService({ rootDir: root, persistence, scriptRunner: async (...args) => { scripts.push(args); return { ok: false }; } }).recordEvent({ reference: record.record.id, type: 'status', status: 'triagem', evidence: 'evidencias/triagem.png' });
    const state = await readFluxoState(root, { persistence });
    assert.equal(scripts.length, 0);
    assert.equal(state.campaign.totalGoal, 2);
    assert.equal(state.queue.items[0].id, item.id);
    assert.equal(state.applications.items[0].status, 'triagem');
    assert.equal(state.applications.items[0].history.length, 1);
    assert.equal(state.applications.items[0].evidence[1], 'evidencias/triagem.png');
    assert.equal(state.applications.items[0].evidenceMetadata[0].sha256.length, 64);
    assert.equal((await persistence.getApplications()).length, 1);
    assert.equal(repeated.commandResult.idempotent, true);
    assert.equal((await persistence.getQueue())[0].status, 'enviada');
  } finally { persistence.close(); }
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-sqlite-services-'));
  for (const directory of ['config', 'estado', 'evidencias']) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, 'config', 'plataformas.json'), JSON.stringify({ platforms: [{ name: 'GUPY' }] }));
  await writeFile(join(root, 'evidencias', 'confirmacao.png'), 'proof');
  return root;
}
