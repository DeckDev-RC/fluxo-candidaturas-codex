import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaywrightDriver } from '../src/playwright-driver.mjs';

// Modo hospedado: o driver não lança Chromium; conecta por CDP ao navegador do
// app e opera as abas que a janela abre a pedido, achadas pela URL marcadora.
function paginaFalsa(url) {
  const pagina = {
    fechada: false,
    _url: url,
    navegacoes: [],
    url: () => pagina._url,
    isClosed: () => pagina.fechada,
    setDefaultTimeout() {},
    once() {},
    async goto(destino) { pagina._url = destino; pagina.navegacoes.push(destino); },
    async waitForLoadState() {},
    async bringToFront() { pagina.trazida = true; },
    async evaluate() { return { url: pagina._url, title: 'Página', challenge: null, loginPending: /login/.test(pagina._url) }; },
    async emulateMedia(opcoes) { pagina.emulacao = opcoes; }
  };
  return pagina;
}

function navegadorFalso() {
  const paginas = [];
  const contexto = { pages: () => paginas, on() {}, async newPage() { const p = paginaFalsa('about:blank'); paginas.push(p); return p; } };
  const browser = { fechado: false, contexts: () => [contexto], once() {}, async close() { browser.fechado = true; } };
  const chromium = {
    conexoes: [],
    lancamentos: 0,
    async connectOverCDP(endpoint) { chromium.conexoes.push(endpoint); return browser; },
    async launchPersistentContext() { chromium.lancamentos += 1; throw new Error('não deveria lançar Chromium próprio'); }
  };
  return { chromium, paginas, browser };
}

test('abre a aba pela janela, encontra a página pela URL marcadora e mostra a aba ao abrir a plataforma', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-driver-hospedado-'));
  const { chromium, paginas, browser } = navegadorFalso();
  const pedidos = [];
  const host = {
    cdpEndpoint: 'http://127.0.0.1:9333',
    markerUrl: (platform) => `http://127.0.0.1:4173/aba/${platform}`,
    async openTab(platform, url) { pedidos.push(['abrir', platform, url]); setTimeout(() => paginas.push(paginaFalsa(url)), 20); },
    async showTab(platform) { pedidos.push(['mostrar', platform]); },
    async hideTab() { pedidos.push(['esconder']); }
  };
  const driver = createPlaywrightDriver({ rootDir, browserType: chromium, host });

  // A janela do app já existe como página quando o driver conecta: ela não pode
  // herdar o esquema de cores claro que o Playwright impõe ao conectar.
  paginas.push(paginaFalsa('http://127.0.0.1:4173/#agora'));
  const aberta = await driver.openPlatform('LINKEDIN', 'https://www.linkedin.com/login');
  assert.deepEqual(chromium.conexoes, ['http://127.0.0.1:9333']);
  assert.deepEqual(paginas[0].emulacao, { colorScheme: null, reducedMotion: null, forcedColors: null }, 'a página da interface volta ao tema do sistema');
  assert.equal(chromium.lancamentos, 0, 'nenhum Chromium próprio');
  assert.deepEqual(pedidos, [['abrir', 'LINKEDIN', 'http://127.0.0.1:4173/aba/LINKEDIN'], ['mostrar', 'LINKEDIN']]);
  assert.equal(aberta.loginPending, true);
  const abaLinkedin = paginas.find((p) => p.navegacoes.includes('https://www.linkedin.com/login'));
  assert.ok(abaLinkedin, 'a navegação aconteceu na aba que a janela abriu');
  assert.equal(abaLinkedin.trazida, undefined, 'em modo hospedado quem mostra a aba é a janela, não bringToFront');

  // Navegar para uma URL da mesma plataforma reaproveita a aba; página fora do catálogo vai para a aba genérica.
  await driver.goto('https://www.linkedin.com/jobs/search/?keywords=dados');
  assert.equal(abaLinkedin.navegacoes.length, 2);
  await driver.goto('http://127.0.0.1:65000/quadro');
  assert.deepEqual(pedidos.at(-1), ['abrir', 'FLUXO', 'http://127.0.0.1:4173/aba/FLUXO']);
  const abas = await driver.tabs();
  assert.deepEqual(abas.map((aba) => aba.platform), ['LINKEDIN'], 'a aba genérica não aparece para a pessoa');

  await driver.close();
  assert.equal(browser.fechado, true, 'close desconecta do navegador do app');
});

test('sem a aba na janela dentro do prazo, o driver falha com código próprio em vez de travar', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-driver-hospedado-'));
  const { chromium } = navegadorFalso();
  const driver = createPlaywrightDriver({ rootDir, browserType: chromium, host: { cdpEndpoint: 'http://127.0.0.1:9333', tabTimeoutMs: 300, markerUrl: (p) => `http://127.0.0.1:4173/aba/${p}`, async openTab() {} } });
  await assert.rejects(driver.openPlatform('GUPY', 'https://portal.gupy.io/'), { code: 'browser_tab_unavailable' });
});
