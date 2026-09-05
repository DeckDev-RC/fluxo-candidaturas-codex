import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { join } from 'node:path';
import { createLocalRuntime } from '../app/src/runtime.mjs';
import { createServer } from '../app/src/http-server.mjs';
import { artifacts, closeServer, listen, onboard, resumeFileWithoutRole, syntheticRoot } from './support/journey-fixture.mjs';

// U10-04: interação real no navegador. Procurar texto no código não prova que a
// pessoa consegue navegar, decidir, corrigir um dado e voltar ao contexto.

test('U10-04 — teclado, foco e diálogo sem armadilha', { timeout: 120_000 }, async (t) => {
  const { page } = await abrir(t);

  // O primeiro tabulável é o atalho para o conteúdo.
  await page.keyboard.press('Tab');
  assert.equal(await foco(page), 'Ir para o conteúdo');

  // A navegação principal é alcançável só com teclado.
  const rotulos = [];
  for (let passo = 0; passo < 6; passo += 1) {
    await page.keyboard.press('Tab');
    rotulos.push(await foco(page));
  }
  for (const area of ['Agora', 'Oportunidades', 'Candidaturas', 'Meu perfil']) {
    assert.ok(rotulos.includes(area), `${area} precisa estar na ordem de foco; observado: ${rotulos.join(' | ')}`);
  }

  // O diálogo recebe o foco, fecha por Escape e devolve o foco ao gatilho.
  const gatilho = page.locator('#editar-objetivo');
  await gatilho.focus();
  await page.keyboard.press('Enter');
  await page.locator('#novo-objetivo').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'novo-objetivo');
  await page.keyboard.press('Escape');
  await page.locator('#dialogo').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'editar-objetivo');
});

test('U8-03 — janelas de referência e zoom de 200% preservam as ações', { timeout: 120_000 }, async (t) => {
  const { page } = await abrir(t);

  for (const [largura, altura] of [[1024, 768], [1366, 768], [1920, 1080]]) {
    await page.setViewportSize({ width: largura, height: altura });
    await page.locator('#painel-agora').waitFor();
    const excesso = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(excesso <= 1, `em ${largura}×${altura} a tela não deve rolar na horizontal (excesso ${excesso}px)`);
    const acao = page.locator('#acoes-agora button').first();
    if (await acao.count()) {
      const caixa = await acao.boundingBox();
      assert.ok(caixa && caixa.x >= 0 && caixa.x + caixa.width <= largura + 1, `ação principal cortada em ${largura}px`);
    }
  }

  // Zoom de 200% equivale a metade da área útil: a ação principal continua acessível.
  await page.setViewportSize({ width: 640, height: 512 });
  await page.locator('#painel-agora').waitFor();
  const excessoZoom = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(excessoZoom <= 1, `com zoom de 200% não deve haver rolagem horizontal (excesso ${excessoZoom}px)`);

  // A conversa ocupa faixa própria: nunca fica sobre a área de trabalho.
  const faixas = await page.evaluate(() => {
    const area = document.querySelector('#conteudo').getBoundingClientRect();
    const conversa = document.querySelector('.conversa').getBoundingClientRect();
    const cabecalho = document.querySelector('.cabecalho').getBoundingClientRect();
    return { areaTopo: area.top, areaBase: area.bottom, conversaTopo: conversa.top, cabecalhoBase: cabecalho.bottom, alturaJanela: window.innerHeight };
  });
  assert.ok(faixas.areaBase <= faixas.conversaTopo + 1, 'a conversa não pode cobrir a área de trabalho');
  assert.ok(faixas.areaTopo >= faixas.cabecalhoBase - 1, 'o cabeçalho não pode cobrir a área de trabalho');
  assert.ok(faixas.conversaTopo < faixas.alturaJanela, 'a conversa precisa ficar visível na janela');

  // Toda ação da tela é alcançável rolando a própria área de trabalho.
  const foraDeAlcance = await page.evaluate(() => {
    const area = document.querySelector('#conteudo');
    const base = area.getBoundingClientRect();
    return [...document.querySelectorAll('#tela button, #tela a.botao')]
      .filter((alvo) => alvo.offsetParent !== null)
      .filter((alvo) => {
        const posicao = alvo.getBoundingClientRect().top - base.top + area.scrollTop;
        return posicao < -1 || posicao > area.scrollHeight;
      })
      .map((alvo) => (alvo.textContent || '').trim().slice(0, 40));
  });
  assert.deepEqual(foraDeAlcance, [], 'toda ação precisa ser alcançável rolando a área de trabalho');
  await page.screenshot({ path: join(artifacts, 'ui-zoom-200.png'), fullPage: true });
});

test('U8-05 — movimento reduzido desliga a animação de ocupado', { timeout: 120_000 }, async (t) => {
  const { page } = await abrir(t, { reducedMotion: 'reduce' });
  const animacao = await page.evaluate(() => {
    const alvo = document.createElement('span');
    alvo.className = 'ocupado';
    document.body.append(alvo);
    const estilo = window.getComputedStyle(alvo, '::before').animationName;
    alvo.remove();
    return estilo;
  });
  assert.equal(animacao, 'none', 'com movimento reduzido a animação precisa ser desligada');
});

test('U3-03 — corrigir um dado do perfil persiste e não é perguntado de novo', { timeout: 120_000 }, async (t) => {
  const { page, runtime } = await abrir(t);
  await page.locator('[data-rota="perfil"]').click();
  await page.getByRole('heading', { name: 'O que entendi sobre você' }).waitFor();

  await page.locator('button[data-corrigir="location"]').click();
  await page.locator('#corrigir-valor').fill('Belo Horizonte');
  await page.getByRole('button', { name: 'Salvar correção' }).click();
  await page.getByText('Belo Horizonte').first().waitFor({ timeout: 30_000 });

  const memoria = await runtime.memoryService.safeSummary();
  assert.equal(memoria.facts.location.value, 'Belo Horizonte');
  assert.equal(memoria.facts.location.confirmed, true);
  assert.match(memoria.facts.location.sourceLabel ?? memoria.facts.location.source, /[Rr]esposta/);

  // Recarregar mantém o valor corrigido: a pergunta não volta.
  await page.reload();
  await page.locator('[data-rota="perfil"]').click();
  await page.getByText('Belo Horizonte').first().waitFor({ timeout: 30_000 });
});

test('U2-06 — abrir por link e recarregar devolvem o mesmo contexto', { timeout: 120_000 }, async (t) => {
  const { page, url } = await abrir(t);
  await page.goto(`${url}/#candidaturas`);
  await page.getByRole('heading', { name: 'Onde está cada processo' }).waitFor();
  assert.equal(await page.locator('[data-rota="candidaturas"]').getAttribute('aria-current'), 'page');
  await page.reload();
  await page.getByRole('heading', { name: 'Onde está cada processo' }).waitFor();
  assert.equal(await page.locator('[data-rota="candidaturas"]').getAttribute('aria-current'), 'page');
});

test('U9-02 — a demonstração é identificada e não toca em dados reais', { timeout: 120_000 }, async (t) => {
  const { page, url, runtime } = await abrir(t);
  await page.goto(`${url}/?demo=1`);
  await page.getByText(/Demonstração local/).first().waitFor();
  await page.locator('[data-rota="oportunidades"]').click();
  await page.getByText(/Acme Tecnologia/).first().waitFor({ timeout: 30_000 });
  assert.deepEqual(await runtime.persistence.getApplications(), [], 'o modo demonstração não registra candidatura');
  await page.screenshot({ path: join(artifacts, 'ui-demonstracao.png'), fullPage: true });
});

test('U7-02 — indisponibilidade da IA explica efeito sem travar a leitura local', { timeout: 120_000 }, async (t) => {
  const { page } = await abrir(t);
  await page.locator('[data-rota="configuracoes"]').click();
  await page.getByRole('heading', { name: 'Automação de IA' }).waitFor();
  const texto = await page.locator('#painel-ia').innerText();
  assert.match(texto, /indispon[íi]vel/i);
  assert.match(texto, /revisar/i, 'a mensagem precisa dizer o que ainda é possível fazer');
  // A leitura local continuou funcionando mesmo com a automação fora.
  await page.locator('[data-rota="agora"]').click();
  await page.locator('#painel-agora').waitFor();
});

async function abrir(t, { reducedMotion } = {}) {
  const fixture = await syntheticRoot(t, {});
  const runtime = await createLocalRuntime({ rootDir: fixture.root, headless: true, schedulerTickMs: 3_600_000 });
  t.after(async () => { await runtime.close(); await fixture.cleanup(); });
  await onboard(runtime, fixture.root);
  await resumeFileWithoutRole(t);

  const server = createServer({
    rootDir: fixture.root,
    queueService: runtime.queueService,
    runService: runtime.runService,
    approvalService: runtime.approvalService,
    policyGateway: runtime.policyGateway,
    stateStore: runtime.stateStore,
    applicationFlow: runtime.applicationFlow,
    memoryService: runtime.memoryService,
    followUpMonitor: runtime.followUpMonitor,
    exceptionService: runtime.exceptionService,
    autopilotService: runtime.autopilotService,
    orchestrator: runtime.orchestrator,
    resumeImportService: runtime.resumeImportService,
    schedulerService: runtime.schedulerService,
    notificationService: runtime.notificationService,
    // Serviço de login apontado para um executável ausente: isola o Codex da pessoa.
    authService: { async status() { return { status: 'unavailable', authenticated: false, message: 'A automação de IA não está conectada neste ambiente de teste.' }; } },
    runtimeHealth: { async snapshot() { return { available: false, message: 'A automação de IA não está conectada. Você continua podendo revisar e decidir.' }; } }
  });
  await listen(server);
  t.after(async () => { await closeServer(server); });

  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, ...(reducedMotion ? { reducedMotion } : {}) });
  const erros = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  page.on('console', (mensagem) => { if (mensagem.type() === 'error') erros.push(mensagem.text()); });
  const url = `http://127.0.0.1:${server.address().port}`;
  await page.goto(url);
  await page.locator('#painel-agora').waitFor({ timeout: 30_000 });
  t.after(() => { assert.deepEqual(erros, [], 'a interface não pode registrar erro de página'); });
  return { page, runtime, url, fixture };
}

function foco(page) {
  return page.evaluate(() => {
    const ativo = document.activeElement;
    if (!ativo) return '';
    return (ativo.getAttribute('aria-label') || ativo.textContent || ativo.id || '').trim();
  });
}
