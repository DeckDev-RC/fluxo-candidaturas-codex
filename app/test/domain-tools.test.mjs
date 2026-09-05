import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomainTools } from '../src/domain-tools.mjs';

test('domain registry denies arbitrary commands and approval decisions', async () => {
  const tools = createDomainTools({ readState: async () => ({ queue: { items: [] } }) });
  assert.equal(tools.definitions.some(tool => /shell|exec|approve|decision/.test(tool.name)), false);
  await assert.rejects(tools.call('shell', { command: 'echo nope' }, 'run1'), { code: 'tool_not_allowed' });
  await assert.rejects(tools.call('approval_decide', {}, 'run1'), { code: 'tool_not_allowed' });
  assert.deepEqual(await tools.call('fluxo_state', {}, 'run1'), { queue: { items: [] } });
});

// A IA condutora abre cada plataforma na aba dela e descobre se a pessoa precisa entrar.
test('fluxo_open_platform abre a página de entrada e fluxo_browser_status lista as abas', async () => {
  const chamadas = [];
  const browserAdapter = {
    async openPlatform(platform, url) { chamadas.push([platform, url]); return { platform, url, title: 'Entrar', loginPending: true, challenge: null }; },
    async tabs() { return [{ platform: 'LINKEDIN', url: 'https://www.linkedin.com/login', loginPending: true, challenge: null }]; }
  };
  const tools = createDomainTools({ browserAdapter, platformUrls: () => ({ GUPY: 'https://empresa.gupy.io/{q}' }) });
  const aberto = await tools.call('fluxo_open_platform', { platform: 'linkedin' }, 'run1');
  assert.equal(aberto.loginPending, true);
  assert.deepEqual(chamadas, [['LINKEDIN', 'https://www.linkedin.com/jobs/']]);
  await tools.call('fluxo_open_platform', { platform: 'GUPY' }, 'run1');
  assert.deepEqual(chamadas[1], ['GUPY', 'https://empresa.gupy.io/'], 'URL configurada no .env vira a página de entrada');
  await assert.rejects(tools.call('fluxo_open_platform', { platform: 'DESCONHECIDA' }, 'run1'), { code: 'invalid_platform' });
  assert.equal((await tools.call('fluxo_browser_status', {}, 'run1')).tabs[0].platform, 'LINKEDIN');
});

test('fluxo_discover monta a busca a partir do objetivo confirmado quando searchUrl é omitida', async () => {
  const pedidos = [];
  const tools = createDomainTools({
    readState: async () => ({ installation: { ready: true } }),
    memoryService: { safeSummary: async () => ({ facts: { targetRoles: { confirmed: true, value: 'Desenvolvedora Node' }, location: { confirmed: true, value: 'Curitiba' } } }) },
    discoveryService: { discover: async (input) => { pedidos.push(input); return { created: [] }; } }
  });
  await tools.call('fluxo_discover', { platform: 'infojobs' }, 'run1');
  assert.deepEqual(pedidos[0].platforms, ['INFOJOBS']);
  assert.match(pedidos[0].searchUrl, /^https:\/\/www\.infojobs\.com\.br\/vagas\.aspx\?palabra=Desenvolvedora%20Node%20Curitiba$/);
  await assert.rejects(tools.call('fluxo_discover', { platform: 'PANDAPE' }, 'run1'), { code: 'search_unavailable' });
  await tools.call('fluxo_discover', { platform: 'GUPY', searchUrl: 'https://portal.gupy.io/job-search/node' }, 'run1');
  assert.equal(pedidos[1].searchUrl, 'https://portal.gupy.io/job-search/node');
});

test('agent cannot submit or fill another run context', async () => {
  const tools = createDomainTools({ applicationFlow: { getWorkflow() { return { parentRunId: 'other' }; } } });
  await assert.rejects(tools.call('fluxo_submit', { runId: 'foreign', approvalId: 'a' }, 'mine'), { code: 'tool_run_mismatch' });
});
