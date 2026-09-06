import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { CARTOES_DE_VAGA, EMPRESA_DESCONHECIDA, lerCartoesDeVaga } from '../app/src/platform-cards.mjs';

// As páginas públicas de busca não publicam JSON-LD (sondagem de 05/09/2026):
// as vagas vêm dos cartões. Aqui a leitura roda num Chromium real sobre marcação
// no formato observado em cada plataforma, sem tocar as plataformas.
const PAGINA = `
<ul>
  <li><a href="https://empresa.gupy.io/job/abc?jobBoardSource=gupy_portal"><p>Cambuhy Agrícola</p><h3>Auxiliar de Viveiro | Matão - SP<div>Auxiliar de Viveiro | Matão - SP</div></h3><span>Matão - SP</span></a></li>
  <li><a href="https://empresa.gupy.io/job/abc?jobBoardSource=gupy_portal"><p>Cambuhy Agrícola</p><h3>Auxiliar de Viveiro | Matão - SP</h3></a></li>
  <li><a href="https://outra.gupy.io/job/def"><h3>Engenharia de Dados</h3></a></li>
  <li><a href="https://portal.gupy.io/">Início</a></li>
</ul>`;

test('os cartões viram vagas com título, empresa e local, sem duplicar o mesmo link', { timeout: 30_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(PAGINA);
    // Página local não tem hospedagem: o catálogo de teste casa com hospedagem vazia.
    const catalogo = { TESTE: { ...CARTOES_DE_VAGA.GUPY, host: '^$' } };
    const vagas = await page.evaluate(([fonte, cat, desconhecida]) => (new Function(`return (${fonte})`))()(cat, desconhecida), [lerCartoesDeVaga.toString(), catalogo, EMPRESA_DESCONHECIDA]);
    assert.equal(vagas.length, 2, 'link repetido e link fora do padrão não viram vaga');
    // Título repetido num trecho oculto (como no LinkedIn) não vira "Cargo Cargo"; e a
    // vaga não carrega `source` (a plataforma é a da página, não "card").
    assert.deepEqual(vagas[0], { title: 'Auxiliar de Viveiro | Matão - SP', company: 'Cambuhy Agrícola', url: 'https://empresa.gupy.io/job/abc?jobBoardSource=gupy_portal', id: 'https://empresa.gupy.io/job/abc?jobBoardSource=gupy_portal', location: 'Matão - SP', requirements: [], deadline: '', observedFrom: 'card' });
    assert.equal(vagas[1].company, EMPRESA_DESCONHECIDA, 'sem empresa no cartão, a vaga entra com empresa não informada');
  } finally { await browser.close(); }
});

// Achado do teste real: a home do InfoJobs tinha uma vaga com "reconhecimento
// facial" no texto e o driver dizia "desafio biométrico". Desafio é estrutura
// (widget, campo de código, banner), nunca palavra na página.
test('desafios são detectados pela estrutura da página, não pelo texto das vagas', { timeout: 60_000 }, async (t) => {
  const { createServer } = await import('node:http');
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createPlaywrightDriver } = await import('../app/src/playwright-driver.mjs');
  const paginas = {
    '/texto': '<h1>Vagas</h1><p>Sistema de controle de acesso por reconhecimento facial e captcha interno. Código de verificação de qualidade.</p>',
    '/captcha': '<h1>Entrar</h1><div class="g-recaptcha" style="width:300px;height:78px">captcha</div>',
    '/codigo': '<h1>Confirme</h1><input autocomplete="one-time-code" inputmode="numeric" maxlength="6">',
    '/cookies': '<h1>Vagas</h1><div id="cookie-banner" role="dialog" style="position:fixed;bottom:0;width:100%;height:120px;background:#eee"><p>Usamos cookies.</p><button>Aceitar todos</button><button>Saiba mais</button></div>',
    // Página de visitante como a do LinkedIn: sem campo de senha, URL neutra, mas "Sign in" no topo.
    '/visitante': '<nav style="height:60px"><a href="/">Logo</a><a href="https://x.test/signup">Join now</a><a href="https://x.test/login?x=1">Sign in</a></nav><h1>Cadastre-se agora e descubra vagas</h1>',
    // Página de quem já entrou: o único "Entrar" está no rodapé, longe do topo.
    '/entrou': '<nav style="height:60px"><a href="/">Logo</a><a href="/perfil">Minha área</a></nav><div style="height:1200px"></div><footer><a href="/login">Entrar</a></footer>'
  };
  const servidor = createServer((request, response) => { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(`<!doctype html><title>Teste</title>${paginas[request.url] ?? ''}`); });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const driver = createPlaywrightDriver({ rootDir: await mkdtemp(join(tmpdir(), 'fluxo-desafio-')), headless: true });
  t.after(async () => { await driver.close(); await new Promise((resolve) => servidor.close(resolve)); });

  await driver.goto(`${base}/texto`);
  assert.equal((await driver.snapshot()).challenge, null, 'palavras no texto não são desafio');
  assert.equal((await driver.loginState()).consentPending, false);
  await driver.goto(`${base}/captcha`);
  assert.equal((await driver.snapshot()).challenge, 'captcha');
  await driver.goto(`${base}/codigo`);
  assert.equal((await driver.snapshot()).challenge, 'mfa');
  await driver.goto(`${base}/cookies`);
  const estado = await driver.loginState();
  assert.equal(estado.challenge, null);
  assert.equal(estado.consentPending, true, 'banner de consentimento é da pessoa, não desafio nem erro');
  // Achado do teste real: a página de visitante do LinkedIn não tem senha nem URL de
  // login, e o driver dizia "você já está conectado".
  await driver.goto(`${base}/visitante`);
  assert.equal((await driver.loginState()).loginPending, true, 'botão de entrar/cadastrar no topo é login pendente');
  await driver.goto(`${base}/entrou`);
  assert.equal((await driver.loginState()).loginPending, false, 'link de entrar no rodapé não conta');
});

test('o catálogo de cartões é válido: expressões compilam e seletores são aceitos pelo navegador', { timeout: 30_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const [plataforma, entrada] of Object.entries(CARTOES_DE_VAGA)) {
      assert.doesNotThrow(() => new RegExp(entrada.host), `${plataforma}: host`);
      assert.doesNotThrow(() => new RegExp(entrada.link), `${plataforma}: link`);
      const aceitos = await page.evaluate((seletores) => seletores.map((s) => { try { document.querySelector(s); return true; } catch { return false; } }), [entrada.card, entrada.title, entrada.company, entrada.location]);
      assert.deepEqual(aceitos, [true, true, true, true], `${plataforma}: seletores`);
    }
    // A URL de busca de cada plataforma pertence à hospedagem do próprio cartão.
    const { buildPlatformSearch } = await import('../app/src/platform-search.mjs');
    for (const busca of buildPlatformSearch({ filters: { roles: 'dados' }, platforms: Object.keys(CARTOES_DE_VAGA) })) {
      assert.match(new URL(busca.searchUrl).hostname, new RegExp(CARTOES_DE_VAGA[busca.platform].host, 'i'), busca.platform);
    }
  } finally { await browser.close(); }
});
