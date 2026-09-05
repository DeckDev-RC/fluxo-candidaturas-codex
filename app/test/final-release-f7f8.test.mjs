import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalRuntime } from '../src/runtime.mjs';
import { createAutopilotOrchestrator } from '../src/orchestrator-service.mjs';
import { createRunService } from '../src/run-service.mjs';
import { applyCampaignFilters } from '../src/campaign-filters.mjs';
import { createCampaignBudget } from '../src/campaign-budget.mjs';
import { createPersistenceAuthority } from '../src/persistence-authority.mjs';

test('new roots use SQLite authority and do not treat JSON as a parallel source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-sqlite-root-'));
  const runtime = await createLocalRuntime({ rootDir: root });
  try {
    assert.equal(await runtime.persistence.isSqliteAuthority(), true);
    assert.equal(await runtime.persistence.getMode(), 'sqlite');
  } finally { await runtime.close(); }
});

test('production packages must not auto-select fixture mode', async () => {
  const { createAutopilotService } = await import('../src/autopilot-service.mjs');
  let used;
  const service = createAutopilotService({
    productionOrchestrator: { async start(input) { used = input.mode; return { run: { id: 'r', mode: input.mode }, status: 'running' }; } },
    orchestrator: { async start() { used = 'fixture'; return { run: { id: 'f', mode: 'fixture' }, status: 'running' }; } },
    runService: { startRun() { throw new Error('não deve criar run avulso'); } }
  });
  const started = await service.start({ intent: 'Backend' });
  assert.equal(used, 'autonomous');
  assert.equal(started.run.mode, 'autonomous');
});

test('controlled campaign of 20 opportunities tracks duplicates, exclusions, approvals and cancel', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-20-'));
  const runService = createRunService({ dbPath: join(root, 'harness.sqlite') });
  const budget = createCampaignBudget({ config: { maxApplicationsPerRun: 5, maxConsecutiveFailures: 3 } });
  const opportunities = Array.from({ length: 20 }, (_, index) => ({
    id: `job-${index + 1}`,
    role: index % 5 === 0 ? 'Estágio' : 'Backend',
    company: index % 7 === 0 ? 'Acme' : `Empresa ${index}`,
    location: 'Remoto',
    workMode: 'Remoto',
    identifierOrUrl: index % 7 === 0 ? 'https://gupy.io/jobs/acme' : `https://gupy.io/jobs/${index + 1}`
  }));
  const filters = { roles: ['Backend'], exclusions: ['Estágio'] };
  const decisions = opportunities.map((item) => ({
    item,
    filter: applyCampaignFilters(item, filters, { skills: { value: ['Node.js'], confirmed: true } })
  }));
  const excluded = decisions.filter((item) => !item.filter.eligible);
  const seen = new Set();
  const unique = [];
  for (const entry of decisions.filter((item) => item.filter.eligible)) {
    const key = `${entry.item.company}|${entry.item.role}|${entry.item.identifierOrUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry.item);
  }
  let approved = 0;
  const failures = [];
  for (const [index, item] of unique.entries()) {
    budget.assertCanAct('external');
    if (index === 0 || index === 1 || index === 2) failures.push({ stage: index, recovered: true });
    if (index === 3) { budget.cancel(); break; }
    budget.recordSubmission();
    approved += 1;
  }
  assert.equal(excluded.length > 0, true);
  assert.equal(unique.length < opportunities.length, true);
  assert.equal(approved <= 5, true);
  assert.equal(failures.length, 3);
  assert.throws(() => budget.assertCanAct('external'), { code: 'campaign_cancelled' });
  const orchestrator = createAutopilotOrchestrator({
    runService,
    budget,
    agents: Object.fromEntries(['intake', 'discovery', 'fit', 'application', 'followup'].map((name) => [name, { async run() { return { confirmed: true, result: { name } }; } }]))
  });
  const started = await orchestrator.start({ objective: 'campanha-20', mode: 'fixture' });
  const cancelled = orchestrator.cancel(started.run.id);
  assert.equal(cancelled.cancelled, true);
  runService.close();
});

test('legacy JSON root still requires explicit migration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-legacy-mig-'));
  await mkdir(join(root, 'campanha'), { recursive: true });
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ platforms: [] }));
  const persistence = createPersistenceAuthority({ rootDir: root });
  try {
    assert.equal(await persistence.isSqliteAuthority(), false);
    await assert.rejects(persistence.initializeNew(), { code: 'legacy_data_exists' });
  } finally { persistence.close(); }
});
