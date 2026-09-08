import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadinessService } from '../src/readiness-service.mjs';

// A preparação do app não exige mais candidato.md, senha no .env nem PDF na
// pasta: perfil vem da memória, login acontece na aba e a IA pergunta o que
// faltar. Só navegador ausente ou nenhuma plataforma bloqueiam.
function servico(rootDir, { campanha, memoria = { facts: {} }, ia = false, abas = [], navegador = true } = {}) {
  const atualizacoes = [];
  const readiness = createReadinessService({
    rootDir,
    campaignService: { getCampaign: async () => campanha, updateCampaign: async (patch) => { atualizacoes.push(patch); Object.assign(campanha, patch); return campanha; } },
    memoryService: { safeSummary: async () => memoria },
    runtimeHealth: { snapshot: async () => ({ available: ia }) },
    browserTabs: async () => abas,
    browserExecutable: async () => (navegador ? { ok: true, detail: 'Chromium instalado.' } : { ok: false, detail: 'Chromium não encontrado.' })
  });
  return { readiness, atualizacoes };
}

test('sem perfil, currículo, IA ou login a preparação fica pronta e explica que a IA cuida do resto', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-readiness-'));
  const { readiness, atualizacoes } = servico(rootDir, { campanha: { totalGoal: 0, platforms: [{ name: 'GUPY', enabled: true, goal: 10 }, { name: 'LINKEDIN', enabled: true, goal: 10 }, { name: 'CATHO', enabled: false, goal: 10 }] } });
  const relatorio = await readiness.run();
  assert.equal(relatorio.ready, true);
  assert.equal(relatorio.criticalPending, 0);
  const porNome = Object.fromEntries(relatorio.checks.map((item) => [item.name, item]));
  assert.equal(porNome['Perfil confirmado'].status, 'pending');
  assert.equal(porNome['Perfil confirmado'].level, 'warning');
  assert.match(porNome['Perfil confirmado'].detail, /A IA lê o currículo/);
  assert.equal(porNome['Acesso: LinkedIn'].level, 'info');
  assert.match(porNome['Acesso: LinkedIn'].detail, /pede o seu login/);
  assert.equal(porNome['Acesso: Catho'], undefined, 'plataforma desabilitada não entra');
  // Meta total é derivada da soma das plataformas, em vez de aviso perpétuo.
  assert.deepEqual(atualizacoes, [{ totalGoal: 20 }]);
  assert.match(porNome['Meta total'].detail, /Ajustada para 20/);
  const gravado = JSON.parse(await readFile(join(rootDir, 'estado', 'preflight.json'), 'utf8'));
  assert.equal(gravado.ready, true);
  assert.equal(gravado.source, 'app');
  // Na partida do processo a IA não é consultada (isso abriria o app-server só para checar).
  const semIa = await readiness.run({ probeAi: false });
  assert.equal(semIa.checks.some((item) => item.name === 'Automação de IA'), false);
});

test('navegador ausente ou nenhuma plataforma habilitada bloqueiam; aba conectada conta como acesso', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-readiness-'));
  const semNavegador = servico(rootDir, { campanha: { totalGoal: 1, platforms: [{ name: 'GUPY', enabled: true, goal: 1 }] }, navegador: false }).readiness;
  const relatorio = await semNavegador.run();
  assert.equal(relatorio.ready, false);
  assert.equal(relatorio.checks.find((item) => item.name === 'Navegador para as plataformas').fix.includes('browser:install'), true);

  const semPlataforma = servico(rootDir, { campanha: { totalGoal: 0, platforms: [{ name: 'GUPY', enabled: true, goal: 0 }] } }).readiness;
  assert.equal((await semPlataforma.run()).ready, false);

  const conectada = servico(rootDir, {
    campanha: { totalGoal: 1, platforms: [{ name: 'GUPY', enabled: true, goal: 1 }] },
    memoria: { facts: { name: { confirmed: true }, email: { confirmed: true }, phone: { confirmed: true }, targetRoles: { confirmed: true } }, selectedResume: { path: 'curriculo/cv.pdf' } },
    ia: true,
    abas: [{ platform: 'GUPY', loginPending: false, challenge: null }]
  }).readiness;
  const completo = await conectada.run();
  assert.equal(completo.ready, true);
  assert.equal(completo.warnings, 0);
  assert.ok(completo.checks.every((item) => item.status === 'ok'), JSON.stringify(completo.checks.filter((item) => item.status !== 'ok')));
});
