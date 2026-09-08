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
    '/entrou': '<nav style="height:60px"><a href="/">Logo</a><a href="/perfil">Minha área</a></nav><div style="height:1200px"></div><footer><a href="/login">Entrar</a></footer>',
    // Página de vaga como as das plataformas: requisitos em lista sob um título, modalidade no texto.
    '/vaga': '<main><h1>Engenheira de Dados</h1><p>Vaga 100% remota, contratação CLT. Faixa R$ 9.000 a R$ 12.000.</p><h3>Requisitos</h3><ul><li>SQL avançado</li><li>Python</li><li>Spark</li></ul><h3>Requisitos obrigatórios</h3><ul><li>Inglês fluente</li></ul><h3>Benefícios</h3><ul><li>Vale-refeição</li></ul></main>'
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
  // Leitura da página da vaga: requisitos da lista certa, obrigatórios separados, modalidade e faixa.
  await driver.goto(`${base}/vaga`);
  const vaga = await driver.readJobPage();
  assert.deepEqual(vaga.requirements, ['SQL avançado', 'Python', 'Spark'], 'benefícios não entram como requisito');
  assert.deepEqual(vaga.eliminators, ['Inglês fluente']);
  assert.equal(vaga.workMode, 'Remoto');
  assert.match(vaga.salary, /^R\$ 9\.000 a R\$ 12\.000/);
  assert.match(vaga.description, /Engenheira de Dados/);
});

// Réplica da InfoJobs logada mapeada em conta real (07/09/2026): cartão com empresa e
// detalhes, página de vaga com "Habilidades"/"Exigências" e descrição num parágrafo,
// candidatura em um clique com confirmação "Você se candidatou" e convite Premium.
test('InfoJobs sintético: cartões, leitor de vaga e candidatura em um clique confirmada', { timeout: 60_000 }, async (t) => {
  const { createServer } = await import('node:http');
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createPlaywrightDriver } = await import('../app/src/playwright-driver.mjs');
  const { createBrowserAdapter } = await import('../app/src/browser-adapter.mjs');
  const paginas = {
    '/vagas-de-emprego-desenvolvedor-trabalho-home-office.aspx': `<html data-fluxo-plataforma="INFOJOBS"><body>
      <div class="js_rowCard"><a href="https://www.infojobs.com.br/vaga-de-exemplo-em-remoto__90000001.aspx"><h2 class="js_vacancyTitle">Desenvolvedor(A) React</h2></a>
        <a class="text-body" href="https://www.infojobs.com.br/empresa-sintetica__900001.aspx"><span>Empresa Sintética</span></a>
        <div class="mb-8">Todo Brasil<span class="js_divUserVagaDistance">, a 820,6 Km de você.</span></div>
        <div class="d-inline-flex flex-wrap mb-8 text-medium"><div>R$ 8.000,00</div><div>Ensino Superior</div><div>Home office</div></div></div>
      <div class="js_rowCard"><a href="https://www.infojobs.com.br/vaga-de-exemplo-em-hibrido__90000002.aspx"><h2 class="js_vacancyTitle">Analista Sênior</h2></a>
        <div class="mb-8">Agudos - SP<span class="js_divUserVagaDistance">, a 648,9 Km de você.</span></div>
        <div class="d-inline-flex flex-wrap mb-8 text-medium"><div>A combinar</div><div>Presencial</div></div></div></body></html>`,
    '/vaga-de-exemplo-em-remoto__90000001.aspx': `<html data-fluxo-plataforma="INFOJOBS"><body><main>
      <div class="js_applyVacancyHidden"><h2 class="js_vacancyHeaderTitle">Desenvolvedor(A) React</h2>
        <div class="h4"><a href="https://www.infojobs.com.br/empresa-sintetica__900001.aspx">Empresa Sintética</a></div>
        <div><div class="text-medium">Todo Brasil</div><div class="text-medium">Salário a combinar</div><div class="text-medium">Home office</div></div></div>
      <a class="btn js_btApplyVacancy" href="javascript:void(0)" onclick="this.style.display='none';document.getElementById('ok').hidden=false;document.getElementById('premium').hidden=false">CANDIDATAR-ME</a>
      <div class="js_vacancyDataPanels"><p>Resumo. Requisitos Obrigatórios: - React avançado - TypeScript - Testes com Jest Diferenciais: - GCP Benefícios: - Vale</p></div>
      <p>Tipo de contrato e Jornada: Prestador de Serviços (PJ) - Período Integral</p>
      <div class="h4">Exigências</div><div><ul><li>Escolaridade Mínima: Ensino Superior</li></ul></div>
      <div class="h4">Habilidades</div><div><div class="tag"><span>React</span></div><div class="tag"><span>Javascript</span></div></div>
      <h3 id="ok" hidden>Você se candidatou à vaga Desenvolvedor(A) React</h3>
      <div id="premium" class="modal show" hidden><h2>Quer aumentar as visualizações?</h2><a href="javascript:void(0)" onclick="this.closest('.modal').hidden=true">Agora não</a></div>
      <div class="similar"><h3>Outras vagas similares</h3><a href="/vaga-de-outra__1.aspx"><h2>Outra</h2></a><a class="btn js_btnApplySimilar" href="javascript:void(0)">Candidatar-me</a></div>
    </main></body></html>`
  };
  const servidor = createServer((request, response) => { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(`<!doctype html><title>Infojobs</title>${paginas[request.url.split('?')[0]] ?? '<h1>Nada</h1>'}`); });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const driver = createPlaywrightDriver({ rootDir: await mkdtemp(join(tmpdir(), 'fluxo-infojobs-')), headless: true });
  const adapter = createBrowserAdapter({ driver });
  t.after(async () => { await driver.close(); await new Promise((resolve) => servidor.close(resolve)); });

  // Cartões: empresa pelo link /empresa-, local sem distância, modalidade e salário da linha de detalhes.
  await driver.goto(`${base}/vagas-de-emprego-desenvolvedor-trabalho-home-office.aspx`);
  const busca = await driver.snapshot();
  assert.equal(busca.jobs.length, 2);
  assert.equal(busca.jobs[0].company, 'Empresa Sintética');
  assert.equal(busca.jobs[0].location, 'Todo Brasil');
  assert.equal(busca.jobs[0].workMode, 'Remoto');
  assert.equal(busca.jobs[0].salary, 'R$ 8.000,00');
  assert.equal(busca.jobs[1].location, 'Agudos - SP');
  assert.equal(busca.jobs[1].workMode, 'Presencial');

  // Página da vaga: leitor específico separa requisitos, exigências e diferenciais; acha o botão certo.
  await driver.goto(`${base}/vaga-de-exemplo-em-remoto__90000001.aspx`);
  const vaga = await driver.readJobPage();
  assert.equal(vaga.company, 'Empresa Sintética');
  assert.equal(vaga.workMode, 'Remoto');
  assert.deepEqual(vaga.requirements, ['React', 'Javascript', 'React avançado', 'TypeScript', 'Testes com Jest']);
  assert.deepEqual(vaga.eliminators, ['Escolaridade Mínima: Ensino Superior']);
  assert.deepEqual(vaga.niceToHave, ['GCP']);
  assert.match(vaga.contract, /PJ/);
  assert.equal(vaga.applyLabel, 'CANDIDATAR-ME');
  const antes = await driver.snapshot();
  assert.deepEqual(antes.fieldDetails.find((f) => f.ref === 'submit'), { ref: 'submit', name: 'submit', label: 'CANDIDATAR-ME', type: 'submit' }, 'o link de candidatura vira o campo submit');
  assert.equal(antes.confirmationText, '');

  // Envio em um clique pelo adaptador: espera a confirmação, lê "Você se candidatou", fecha o convite.
  await adapter.snapshot();
  const envio = await adapter.submitWithRetry('submit', { expected: { identifierOrUrl: `${base}/vaga-de-exemplo-em-remoto__90000001.aspx` } });
  assert.equal(envio.confirmed, true);
  assert.equal(envio.kind, 'confirmed');
  assert.match(envio.state.confirmationText, /Você se candidatou à vaga Desenvolvedor\(A\) React/);
  const depois = await driver.snapshot();
  assert.match(depois.confirmationText, /Você se candidatou/, 'a confirmação continua visível depois de fechar o convite');
  assert.doesNotMatch(depois.text, /Quer aumentar as visualizações/, 'o convite Premium foi fechado');
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
