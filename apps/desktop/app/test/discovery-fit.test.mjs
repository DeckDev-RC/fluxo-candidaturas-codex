import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveryService, createPlaywrightDiscoveryAdapter } from '../src/discovery-service.mjs';
import { createFitService } from '../src/fit-service.mjs';

test('discovery normalizes fixture opportunities, deduplicates them, records source and can resume a failed platform', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-discovery-'));
  const added = [];
  const discovery = createDiscoveryService({
    rootDir: root,
    queueService: { async addQueueItem(item) { if (added.some((entry) => entry.key === item.key)) throw Object.assign(new Error('duplicate'), { code: 'queue_duplicate' }); added.push(item); return item; } },
    adapters: {
      GUPY: { async search() { return [{ title: 'Backend Pleno', company: 'Acme', location: 'Remoto', url: 'https://gupy.io/jobs/42', requirements: ['Node.js', 'SQL'], deadline: '2026-09-20' }, { title: 'Backend Pleno', company: 'Acme', location: 'Remoto', url: 'https://gupy.io/jobs/42', requirements: ['Node.js'] }]; } },
      LINKEDIN: { async search() { throw new Error('indisponível'); } }
    },
    now: () => new Date('2026-09-04T12:00:00.000Z')
  });

  const result = await discovery.discover({ roles: ['Backend'], locations: ['Remoto'], workModes: ['Remoto'], platforms: ['GUPY', 'LINKEDIN'], runId: 'run-discovery' });
  assert.equal(result.created.length, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.failures[0].platform, 'LINKEDIN');
  assert.equal(result.opportunities[0].source, 'GUPY');
  assert.equal(result.opportunities[0].collectedAt, '2026-09-04T12:00:00.000Z');
  assert.equal(result.opportunities[0].requirements.length, 2);
  assert.equal(result.nextAction, 'Tentar novamente as plataformas indisponíveis quando estiverem acessíveis.');
  assert.match(await readFile(join(root, 'estado', 'discovery.json'), 'utf8'), /GUPY/);
});

test('fit separates matched requirements, gaps and eliminators and returns an explained shortlist', async () => {
  const fit = createFitService({ now: () => new Date('2026-09-04T12:00:00.000Z') });
  const result = fit.assess({
    opportunity: { id: 'job-1', role: 'Backend', company: 'Acme', requirements: ['Node.js', 'SQL', 'Inglês'], eliminators: ['Espanhol'] },
    facts: { skills: { value: ['Node.js', 'SQL'] }, languages: { value: 'Português e Inglês' }, location: { value: 'Remoto' } }
  });

  assert.deepEqual(result.matched, ['Node.js', 'SQL', 'Inglês']);
  assert.deepEqual(result.gaps, []);
  assert.deepEqual(result.eliminators, []);
  assert.equal(result.classification, 'forte');
  assert.equal(result.eligible, true);
  assert.match(result.explanation, /3 requisitos/i);
  assert.equal(result.confidence, 'alta');
});

test('fit applies a shortlist limit, blocks weak opportunities and records a human correction', () => {
  const decisions = [];
  const fit = createFitService({ recordDecision: async (decision) => decisions.push(decision) });
  const shortlist = fit.shortlist({
    opportunities: [
      { id: 'strong', role: 'Backend', company: 'A', requirements: ['Node.js'] },
      { id: 'weak', role: 'Backend', company: 'B', requirements: ['Rust', 'Kubernetes', 'Inglês'] }
    ],
    facts: { skills: { value: ['Node.js'] } }, limit: 1
  });

  assert.equal(shortlist.items.length, 1);
  assert.equal(shortlist.items[0].id, 'strong');
  assert.equal(shortlist.items[0].fit.classification, 'forte');
  assert.equal(shortlist.excluded[0].fit.classification, 'fraca');
  return fit.override({ opportunityId: 'weak', decision: 'include', reason: 'Tenho experiência equivalente não listada.' }).then((override) => {
    assert.equal(override.decision, 'include');
    assert.equal(decisions[0].reason, 'Tenho experiência equivalente não listada.');
  });
});

test('playwright discovery adapter navigates to a configured search page before parsing observed jobs', async () => {
  const calls = [];
  const adapter = createPlaywrightDiscoveryAdapter({ platform: 'GUPY', driver: { async goto(url) { calls.push(['goto', url]); }, async snapshot() { return { jobs: [{ id: 'j1', title: 'Backend', company: 'Acme' }] }; } } });
  const result = await adapter.search({ searchUrl: 'https://example.test/jobs' });
  assert.equal(calls[0][1], 'https://example.test/jobs');
  assert.equal(result[0].company, 'Acme');
});
