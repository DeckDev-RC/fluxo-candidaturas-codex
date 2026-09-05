import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSubmissionReview, reviewIdentity } from '../src/review-service.mjs';
import { buildPlatformSearch } from '../src/platform-search.mjs';
import { createDiscoveryService } from '../src/discovery-service.mjs';
import { createBrowserAdapter } from '../src/browser-adapter.mjs';
import { createAutopilotOrchestrator } from '../src/orchestrator-service.mjs';
import { createCodexAuthService } from '../src/codex-auth-service.mjs';

// Cada teste aqui cobre uma falha observada na jornada real de navegador (F8-02/F8-03).

test('busca usa a URL configurada da plataforma e mantém a consulta', () => {
  const searches = buildPlatformSearch({
    filters: { roles: 'engenharia de software' },
    platforms: ['INFOJOBS', { name: 'GUPY', searchUrl: 'http://127.0.0.1:9/vagas?q={q}' }],
    baseUrls: { INFOJOBS: 'http://127.0.0.1:8/jobs' }
  });
  assert.equal(searches[0].searchUrl, 'http://127.0.0.1:8/jobs');
  assert.equal(searches[0].source, 'configurada');
  assert.equal(searches[1].searchUrl, 'http://127.0.0.1:9/vagas?q=engenharia%20de%20software');
  assert.equal(buildPlatformSearch({ platforms: ['PANDAPE'] })[0].unavailable, true);
});

test('descoberta navega para a página de cada plataforma e não repete a mesma URL', async () => {
  const visited = [];
  const adapters = Object.fromEntries(['GUPY', 'INFOJOBS'].map((platform) => [platform, {
    async search(criteria) {
      visited.push([platform, criteria.searchUrl]);
      return [{ title: `Vaga ${platform}`, company: `Empresa ${platform}`, url: `https://example.test/${platform}/1` }];
    }
  }]));
  const queue = { added: [], async addQueueItem(item) { this.added.push(item); return item; } };
  const service = createDiscoveryService({ rootDir: await mkdtemp(join(tmpdir(), 'fluxo-discovery-plan-')), queueService: queue, adapters, mutationLock: false });

  const result = await service.discover({
    platforms: ['GUPY', 'INFOJOBS'],
    searchPlan: [
      { platform: 'GUPY', searchUrl: 'https://gupy.test/busca' },
      { platform: 'INFOJOBS', searchUrl: 'https://infojobs.test/busca' }
    ]
  });
  assert.deepEqual(visited, [['GUPY', 'https://gupy.test/busca'], ['INFOJOBS', 'https://infojobs.test/busca']]);
  assert.equal(result.created.length, 2);
  assert.deepEqual(result.failures, []);
});

test('busca declarada indisponível não vira falha temporária', async () => {
  const service = createDiscoveryService({
    rootDir: await mkdtemp(join(tmpdir(), 'fluxo-discovery-unavailable-')),
    queueService: { async addQueueItem(item) { return item; } },
    adapters: { PANDAPE: { async search() { throw new Error('não deveria navegar'); } } },
    mutationLock: false
  });
  const result = await service.discover({
    platforms: ['PANDAPE'],
    searchPlan: [{ platform: 'PANDAPE', unavailable: true, reason: 'PandaPé não oferece busca pública; use convite.' }]
  });
  assert.equal(result.created.length, 0);
  assert.equal(result.failures[0].type, 'search_unavailable');
  assert.equal(result.failures[0].retryable, false);
});

test('abrir vaga recusa esquema não suportado em vez de fotografar outra página', async () => {
  const driver = { goto: async () => { throw new Error('não deveria navegar'); }, snapshot: async () => ({ url: 'https://example.test/outra', text: 'outra vaga' }) };
  const adapter = createBrowserAdapter({ driver, evidenceRoot: await mkdtemp(join(tmpdir(), 'fluxo-open-scheme-')) });
  await assert.rejects(adapter.open({ identifierOrUrl: 'file:///C:/segredo/.env' }), { code: 'unsupported_target_url' });
  await assert.rejects(adapter.open({ identifierOrUrl: 'javascript:alert(1)' }), { code: 'unsupported_target_url' });
});

test('pausa do orquestrador é publicada como evento para a interface', async () => {
  const events = [];
  const runService = {
    startRun: () => ({ id: 'run-1', kind: 'autopilot' }),
    getRun: () => ({ id: 'run-1', status: 'paused' }),
    appendEvent: (event) => { events.push(event); return event; },
    setPlan: () => {},
    saveWorkflow: () => {},
    getWorkflow: () => null,
    recordTask: () => {},
    pauseRun: () => {}
  };
  const agents = {
    intake: { async run() { return { status: 'waiting_user', observation: 'Preciso de 1 informação.', result: { questions: [{ key: 'targetRoles', prompt: 'Quais cargos?' }] } }; } },
    discovery: { async run() { throw new Error('não deveria executar'); } },
    fit: { async run() {} }, application: { async run() {} }, followup: { async run() {} }
  };
  const orchestrator = createAutopilotOrchestrator({ runService, agents });
  const started = await orchestrator.start({ objective: 'testar pausa' });
  const result = await started.completion;

  assert.equal(result.status, 'waiting_user');
  const pause = events.find((event) => event.type === 'autopilot.waiting_user');
  assert.ok(pause, 'a pausa precisa existir no stream do run');
  assert.equal(pause.payload.task, 'intake');
  assert.equal(pause.payload.questions[0].key, 'targetRoles');
});

test('consulta de status do runtime de IA respeita prazo e não trava a interface', async () => {
  const authService = createCodexAuthService({
    agentAdapter: { request: () => new Promise(() => {}) },
    statusTimeoutMs: 30
  });
  const status = await authService.status();
  assert.equal(status.status, 'unavailable');
  assert.equal(status.authenticated, false);
});

test('revisão de envio identifica vaga, currículo e campos observados', () => {
  const review = buildSubmissionReview({
    item: { company: 'Empresa Sintética', role: 'Engenharia de software', platform: 'INFOJOBS', identifierOrUrl: 'https://example.test/jobs/1' },
    snapshot: { url: 'https://example.test/jobs/1', jobId: '1', fields: ['name', 'email'] },
    resume: { path: 'curriculo/atual.pdf', sha256: 'abc123' }
  });
  assert.equal(review.resumePath, 'curriculo/atual.pdf');
  assert.equal(review.platform, 'INFOJOBS');
  assert.deepEqual(review.observedFields, ['name', 'email']);
  assert.equal(reviewIdentity(review), 'INFOJOBS|1|https://example.test/jobs/1|abc123');
});
