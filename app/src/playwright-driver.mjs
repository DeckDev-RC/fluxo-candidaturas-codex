import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { platformOfUrl } from './platform-search.mjs';
import { CARTOES_DE_VAGA, EMPRESA_DESCONHECIDA, lerCartoesDeVaga } from './platform-cards.mjs';
import { createFreeBrowsing } from './browser-free.mjs';

// O leitor de cartões e o detector de desafios entram na página como texto.
// eslint-disable-next-line no-new-func
const OBSERVAR_PAGINA = new Function('args', `const [catalogo, empresaDesconhecida] = args; const lerCartoesDeVaga = ${lerCartoesDeVaga.toString()}; const detectarDesafio = ${detectarDesafio.toString()}; return (${observePage.toString()})(catalogo, empresaDesconhecida, lerCartoesDeVaga, detectarDesafio);`);
// eslint-disable-next-line no-new-func
const OBSERVAR_LOGIN = new Function(`const detectarDesafio = ${detectarDesafio.toString()}; return (${observeLogin.toString()})(detectarDesafio);`);
// eslint-disable-next-line no-new-func
const OBSERVAR_VAGA = new Function(`return (${observeJobPage.toString()})();`);
// Páginas de busca renderizam a lista depois do HTML: esperar a rede assentar
// evita fotografar a página antes das vagas aparecerem.
const ESPERA_RENDERIZACAO_MS = 8_000;
async function assentar(page) { await page.waitForLoadState('networkidle', { timeout: ESPERA_RENDERIZACAO_MS }).catch(() => {}); }
const ARGUMENTOS_DA_PAGINA = [CARTOES_DE_VAGA, EMPRESA_DESCONHECIDA];

// The driver owns the browser process; importing it or reading local state never launches Chromium.
// Uma aba por plataforma: a URL decide em qual aba a navegação acontece, e a
// pessoa vê cada site no próprio lugar quando a IA conduz.
// Modo hospedado (`host`): em vez de lançar um Chromium próprio, o driver se
// conecta por CDP ao Chromium do app (Electron) e opera as abas que a janela
// abre a pedido — cada uma identificada pela URL marcadora do backend.
const ABA_GENERICA = 'FLUXO';
const ESPERA_ABA_MS = 10_000;

export function createPlaywrightDriver({ rootDir, headless = false, browserType, page: suppliedPage, host = null } = {}) {
  let context; let browser; let page = suppliedPage; let starting;
  const abas = new Map();
  let ativa = '';

  async function getContext() {
    if (context) return context;
    if (!starting) starting = (async () => {
      const chromium = browserType ?? (await import('playwright')).chromium;
      if (host?.cdpEndpoint) {
        browser = await chromium.connectOverCDP(host.cdpEndpoint);
        context = browser.contexts()[0] ?? await browser.newContext();
        browser.once('disconnected', () => { context = null; browser = null; page = null; abas.clear(); ativa = ''; starting = null; });
        // Ao conectar, o Playwright impõe esquema de cores claro a toda página que
        // enxerga, inclusive a janela do app: devolvemos cada página ao sistema.
        for (const existente of context.pages()) void semEmulacao(existente);
        context.on('page', (nova) => { void semEmulacao(nova); });
        return context;
      }
      await mkdir(join(rootDir, 'estado', 'browser-profile'), { recursive: true });
      context = await chromium.launchPersistentContext(join(rootDir, 'estado', 'browser-profile'), { headless, viewport: { width: 1280, height: 900 } });
      const openedContext = context;
      context.once('close', () => { if (context === openedContext) { context = null; page = null; abas.clear(); ativa = ''; starting = null; } });
      return context;
    })().finally(() => { starting = null; });
    return starting;
  }

  async function getPage() {
    if (ativa && abas.get(ativa) && !abas.get(ativa).isClosed()) return abas.get(ativa);
    if (page && !page.isClosed()) return page;
    // Hospedado: página fora do catálogo vai para a aba genérica, escondida.
    if (host?.cdpEndpoint) { page = await pageFor(ABA_GENERICA); return page; }
    const ctx = await getContext();
    page = ctx.pages()[0] ?? await ctx.newPage();
    page.setDefaultTimeout(15_000);
    return page;
  }

  async function pageFor(platform) {
    const nome = String(platform ?? '').toUpperCase();
    if (!nome) return getPage();
    const existente = abas.get(nome);
    if (existente && !existente.isClosed()) return existente;
    const ctx = await getContext();
    const disponivel = host?.cdpEndpoint ? await abaHospedada(ctx, nome) : await abaPropria(ctx);
    disponivel.setDefaultTimeout(15_000);
    disponivel.once('close', () => { if (abas.get(nome) === disponivel) abas.delete(nome); if (ativa === nome) ativa = ''; });
    abas.set(nome, disponivel);
    return disponivel;
  }

  // A primeira plataforma reaproveita a aba inicial em branco; as demais abrem a própria.
  async function abaPropria(ctx) {
    return !abas.size && ctx.pages()[0] && ctx.pages()[0].url() === 'about:blank' ? ctx.pages()[0] : await ctx.newPage();
  }

  // A janela abre a aba carregando a URL marcadora; a página com essa URL é a aba.
  // Depois de uma reconexão, a aba já navegou para a plataforma: a janela informa
  // a URL atual de cada aba e a página é reconhecida por ela, sem recarregar
  // (recarregar a marcadora perderia login e formulário em andamento).
  async function abaHospedada(ctx, nome) {
    const marcadora = host.markerUrl(nome);
    const abertas = host.listTabs ? await Promise.resolve(host.listTabs()).catch(() => []) : [];
    const registrada = (abertas ?? []).find((aba) => String(aba.platform).toUpperCase() === nome);
    const encontrar = () => ctx.pages().find((candidata) => !candidata.isClosed() && (candidata.url().startsWith(marcadora) || (registrada?.url && candidata.url() === registrada.url)));
    let encontrada = encontrar();
    if (!encontrada) {
      await host.openTab(nome, marcadora);
      const inicio = Date.now();
      while (!(encontrada = encontrar())) {
        if (Date.now() - inicio > (host.tabTimeoutMs ?? ESPERA_ABA_MS)) throw error('browser_tab_unavailable', 'A janela não abriu a aba da plataforma.');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    return encontrada;
  }

  async function locator(ref) {
    const current = await getPage();
    const match = ref === 'submit'
      ? current.locator('button[type="submit"], input[type="submit"]')
      : current.locator('[data-fluxo-ref]').filter({ visible: true }).and(current.locator(`[data-fluxo-ref=${JSON.stringify(String(ref))}]`));
    if (await match.count() !== 1) throw error('browser_reference_ambiguous', 'Capture novamente a página e selecione uma referência única.');
    return match;
  }

  // Navegação livre: observar e agir na aba de uma plataforma, com referências
  // próprias. Navegar dentro da aba leva a qualquer http(s) público — uma vaga pode
  // redirecionar para o site da empresa — e a aba continua sendo a da plataforma.
  const livre = createFreeBrowsing({
    // Agir numa aba a torna a plataforma em foco (o "aqui" de pedidos sem plataforma).
    pageFor: async (platform) => { const nome = String(platform ?? '').toUpperCase(); if (!nome) throw error('platform_required', 'Informe a plataforma cuja aba deve ser usada.'); const pagina = await pageFor(nome); ativa = nome; return pagina; },
    goto: async (url, platform) => { const alvo = await pageFor(String(platform).toUpperCase()); ativa = String(platform).toUpperCase(); await alvo.goto(String(url), { waitUntil: 'domcontentloaded' }); await assentar(alvo); },
    assentar
  });

  return {
    activePlatform: () => (ativa === ABA_GENERICA ? '' : ativa),
    observe: (platform, opcoes) => livre.observe(platform, opcoes),
    readText: (platform, opcoes) => livre.read(platform, opcoes),
    act: (platform, acao) => livre.act(platform, acao),
    async goto(url) {
      if (!/^https?:\/\//i.test(String(url))) throw error('invalid_browser_url', 'A navegação exige uma URL HTTP ou HTTPS.');
      const plataforma = platformOfUrl(url);
      // A aba ativa muda antes de resolver a página: URL fora do catálogo nunca
      // navega dentro da aba de uma plataforma.
      ativa = plataforma;
      const alvo = plataforma ? await pageFor(plataforma) : await getPage();
      await alvo.goto(String(url), { waitUntil: 'domcontentloaded' });
      await assentar(alvo);
    },
    // Abre a plataforma na própria aba, traz para a frente e diz se a pessoa precisa entrar.
    async openPlatform(platform, url) {
      const alvo = await pageFor(platform);
      ativa = String(platform).toUpperCase();
      await alvo.goto(String(url), { waitUntil: 'domcontentloaded' });
      await assentar(alvo);
      if (host?.showTab) await host.showTab(ativa).catch(() => {});
      else await alvo.bringToFront().catch(() => {});
      return { platform: ativa, ...(await alvo.evaluate(OBSERVAR_LOGIN)) };
    },
    async loginState(platform) {
      const alvo = platform ? abas.get(String(platform).toUpperCase()) : await getPage();
      if (!alvo || alvo.isClosed()) return { platform: String(platform ?? '').toUpperCase(), open: false };
      return { platform: String(platform ?? '').toUpperCase(), open: true, ...(await alvo.evaluate(OBSERVAR_LOGIN)) };
    },
    async tabs() {
      const lista = [];
      for (const [plataforma, aba] of abas) {
        // A aba genérica do modo hospedado é interna: não é uma plataforma da pessoa.
        if (aba.isClosed() || plataforma === ABA_GENERICA) continue;
        lista.push({ platform: plataforma, ...(await aba.evaluate(OBSERVAR_LOGIN).catch(() => ({ url: aba.url(), title: '', challenge: null, loginPending: false }))) });
      }
      return lista;
    },
    // Leitura da página de uma vaga: descrição e requisitos, para medir aderência de
    // verdade antes de preparar. Só texto renderizado; nada é inventado.
    async readJobPage() { const current = await getPage(); return current.evaluate(OBSERVAR_VAGA); },
    async snapshot() { const current = await getPage(); const observed = await current.evaluate(OBSERVAR_PAGINA, ARGUMENTOS_DA_PAGINA); const formHash = createHash('sha256').update(JSON.stringify(observed.formValues)).digest('hex'); return { ...observed, formHash, observedAt: new Date().toISOString() }; },
    async state() { return this.snapshot(); },
    async fill(ref, value) { const field = await locator(ref); if (await field.getAttribute('type') === 'file') throw error('browser_upload_required', 'Use a operação explícita de anexo.'); await field.fill(String(value)); },
    async click(ref) { await (await locator(ref)).click(); },
    async upload(ref, path) {
      const absolute = resolve(rootDir, path); const rel = relative(join(rootDir, 'curriculo'), absolute);
      if (rel.startsWith('..') || resolve(absolute) === resolve(rootDir)) throw error('invalid_resume_path', 'Anexe um arquivo da pasta curriculo.');
      await (await locator(ref)).setInputFiles(absolute);
    },
    // A evidência prefere o trecho da confirmação: capturar a página inteira
    // arrasta dado pessoal que não é necessário para provar o recebimento.
    async screenshot(path, { scope = 'confirmation' } = {}) {
      const absolute = resolve(rootDir, path); const rel = relative(rootDir, absolute);
      if (rel.startsWith('..')) throw error('invalid_evidence_path', 'A evidência deve permanecer na pasta local.');
      await mkdir(dirname(absolute), { recursive: true });
      const page = await getPage();
      if (scope === 'confirmation') {
        const alvo = page.locator('[data-confirmation], [data-application-status]').first();
        if (await alvo.count().catch(() => 0)) {
          try {
            await alvo.screenshot({ path: absolute });
            return { ok: true, path, scope: 'confirmation' };
          } catch { /* elemento sem caixa visível: cai para a página inteira */ }
        }
      }
      await page.screenshot({ path: absolute, fullPage: true });
      return { ok: true, path, scope: 'page' };
    },
    // Hospedado: só desconecta; o navegador é a janela do app e continua vivo.
    async close() {
      if (browser) await browser.close().catch(() => {});
      else if (context) await context.close();
      browser = null; context = null; page = suppliedPage; abas.clear(); ativa = ''; starting = null;
    }
  };
}

function error(code, message) { return Object.assign(new Error(message), { code }); }

async function semEmulacao(page) {
  try { await page.emulateMedia({ colorScheme: null, reducedMotion: null, forcedColors: null }); } catch { /* página fechada no meio */ }
}

// Runs inside the page. Desafios são detectados pela estrutura (widgets de CAPTCHA,
// campo de código de uso único, banner de consentimento), nunca pelo texto: em um
// quadro de vagas qualquer palavra ("reconhecimento facial", "captcha") pode
// estar na descrição de uma vaga.
function detectarDesafio() {
  const visivel = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const captcha = [...document.querySelectorAll('iframe[src*="recaptcha" i], iframe[src*="hcaptcha" i], iframe[src*="turnstile" i], iframe[src*="captcha" i], .g-recaptcha, .h-captcha, .cf-turnstile, #captcha, [id*="captcha" i]:not(a):not(script), input[name*="captcha" i]')].some(visivel);
  const codigo = [...document.querySelectorAll('input[autocomplete="one-time-code"], input[name*="otp" i], input[id*="otp" i], input[name*="onetime" i], input[name*="verificationcode" i], input[name*="codigo" i][maxlength], input[inputmode="numeric"][maxlength="6"]')].some(visivel);
  const challenge = captcha ? 'captcha' : codigo ? 'mfa' : null;
  const contenedores = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], [id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="didomi" i], [id*="onetrust" i], [id*="cmp" i]')].filter(visivel);
  const consentPending = contenedores.some((c) => [...c.querySelectorAll('button, [role="button"], a')].some((b) => visivel(b) && /^(aceitar|aceito|aceitar todos|accept|accept all|concordo|agree|i agree|permitir|allow)/i.test((b.innerText || '').trim())));
  return { challenge, consentPending };
}

// Runs inside a job page. Requisitos vêm de listas sob títulos de requisitos; sem
// isso, das linhas com marcador no texto; a descrição é o bloco principal.
function observeJobPage() {
  const texto = (el) => (el?.innerText ?? '').replace(/[ \t]+/g, ' ').trim();
  const principal = document.querySelector('main, article, [role="main"], #job-details, .description, [class*="description" i]') ?? document.body;
  const description = texto(principal).slice(0, 6000);
  const titulos = /requisitos|qualifica|requirements|qualifications|o que esperamos|o que buscamos|voc[eê] precisa|skills|habilidades|conhecimentos|diferenciais|pr[eé]-requisitos/i;
  const requisitos = [];
  const eliminadores = [];
  for (const cabecalho of principal.querySelectorAll('h1, h2, h3, h4, h5, strong, b, p')) {
    if (!titulos.test(texto(cabecalho)) || texto(cabecalho).length > 80) continue;
    let proximo = cabecalho.nextElementSibling ?? cabecalho.parentElement?.nextElementSibling;
    let passos = 0;
    while (proximo && passos < 3 && !/^(UL|OL)$/.test(proximo.tagName)) { proximo = proximo.nextElementSibling; passos += 1; }
    if (proximo && /^(UL|OL)$/.test(proximo.tagName)) {
      const obrigatorio = /obrigat|mandat|imprescind|must/i.test(texto(cabecalho));
      for (const li of proximo.querySelectorAll('li')) { const t = texto(li); if (t && t.length <= 200) (obrigatorio ? eliminadores : requisitos).push(t); }
    }
  }
  if (!requisitos.length) {
    for (const linha of description.split('\n')) { const t = linha.replace(/^[\s•\-–*·]+/, '').trim(); if (/^[•\-–*·]/.test(linha.trim()) && t.length >= 6 && t.length <= 200) requisitos.push(t); }
  }
  const tudo = description.toLocaleLowerCase();
  const workMode = /\bremot[oa]\b|home ?office|100% remoto/.test(tudo) ? 'Remoto' : /h[ií]brid[oa]/.test(tudo) ? 'Híbrido' : /presencial|on-?site/.test(tudo) ? 'Presencial' : '';
  const salary = (description.match(/R\$\s?[\d.]+(?:,\d{2})?(?:\s*(?:a|-|até)\s*R\$\s?[\d.]+(?:,\d{2})?)?/) ?? [''])[0];
  return { url: location.href, title: document.title, description, requirements: [...new Set(requisitos)].slice(0, 40), eliminators: [...new Set(eliminadores)].slice(0, 20), workMode, salary };
}

// Runs inside the page: só o necessário para saber se a pessoa precisa entrar.
// Login pendente: campo de senha, URL de login ou, como nas páginas de visitante
// das plataformas (LinkedIn "Sign in / Join now", Gupy "Entrar", InfoJobs "Login"),
// um botão de entrar/cadastrar visível no topo da página.
function observeLogin(detectar = () => ({ challenge: null, consentPending: false })) {
  const { challenge, consentPending } = detectar();
  const senha = Boolean(document.querySelector('input[type="password"]'));
  const urlDeLogin = /login|signin|sign-in|entrar|auth|autentica|checkpoint|signup|cadastr/i.test(location.pathname + location.search);
  const textoDeEntrada = /^(entrar|login|log in|sign in|iniciar sess[aã]o|fazer login|acessar conta|join now|cadastre-se( agora)?|criar conta|inscreva-se)$/i;
  const hrefDeEntrada = /\/(login|signin|sign-in|signup|entrar|cadastr[a-z-]*|candidate\/?)(\?|$|\/)/i;
  const botaoDeEntrada = [...document.querySelectorAll('a[href], button')].some((el) => {
    const caixa = el.getBoundingClientRect();
    if (!(caixa.width > 0 && caixa.height > 0 && caixa.top >= 0 && caixa.top < 240)) return false;
    return textoDeEntrada.test((el.innerText || '').trim().replace(/\s+/g, ' ')) || hrefDeEntrada.test(el.getAttribute('href') || '');
  });
  return { url: location.href, title: document.title, challenge, consentPending, loginPending: senha || urlDeLogin || botaoDeEntrada };
}

// Runs inside the observed page. Only rendered facts and explicit structured job metadata are returned.
// `lerCartoes` e `detectar` chegam como argumentos porque a função é serializada para a página.
function observePage(catalogo = {}, empresaDesconhecida = '', lerCartoes = () => [], detectar = () => ({ challenge: null })) {
  const text = document.body?.innerText ?? '';
  const { challenge } = detectar();
  const fields = []; const fieldDetails = []; const formValues = {};
  for (const [index, element] of [...document.querySelectorAll('input:not([type="hidden"]),textarea,select,button')].entries()) {
    const ref = element.getAttribute('data-fluxo-ref') || `field-${index}`;
    element.setAttribute('data-fluxo-ref', ref);
    const label = element.labels?.[0]?.innerText || element.getAttribute('aria-label') || element.name || element.id || element.innerText || ref;
    fields.push(ref); fieldDetails.push({ ref, name: element.name || '', label, type: element.type || element.tagName.toLowerCase() });
    if (!/password|token|cookie|mfa|authorization|credential|secret/i.test(`${element.type} ${element.name} ${element.id}`)) formValues[ref] = element.type === 'checkbox' ? element.checked : element.type === 'file' ? [...(element.files ?? [])].map(file => file.name) : element.value || '';
  }
  const links = [...document.querySelectorAll('a[href]')].map(anchor => {
    const card = anchor.closest('[data-job],article,li,[data-testid*="job"]');
    return { href: anchor.href, text: anchor.innerText.trim(), company: card?.getAttribute('data-company') || card?.querySelector('[data-company],[itemprop="hiringOrganization"],.company')?.textContent?.trim() || '' };
  });
  const jobs = [];
  function visit(value) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    if (value['@type'] === 'JobPosting' && value.title && value.hiringOrganization?.name) jobs.push({ title: value.title, company: value.hiringOrganization.name, url: value.url || location.href, id: value.identifier?.value || value.url || location.href, requirements: value.skills || [], deadline: value.validThrough || '' });
    if (value['@graph']) visit(value['@graph']);
  }
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) { try { visit(JSON.parse(script.textContent)); } catch { /* Invalid optional website metadata is ignored; unsupported pages still fail in discovery. */ } }
  // Sem JSON-LD, os cartões da plataforma são a fonte das vagas.
  if (!jobs.length) { try { jobs.push(...lerCartoes(catalogo, empresaDesconhecida)); } catch { /* página sem cartões reconhecidos segue como não suportada */ } }
  const confirmation = document.querySelector('[data-confirmation], [role="status"], .application-confirmation');
  const jobId = confirmation?.getAttribute('data-job-id') || document.body?.getAttribute('data-job-id') || '';
  const jobUrl = confirmation?.getAttribute('data-job-url') || document.body?.getAttribute('data-job-url') || '';
  const status = document.querySelector('[data-application-status]');
  return { url: location.href, text, challenge, fields, fieldDetails, formValues, links, ...(jobs.length ? { jobs } : {}), jobId, jobUrl, confirmationText: confirmation?.innerText || '', emptyResults: Boolean(document.querySelector('[data-empty-results]')), applicationStatus: status?.getAttribute('data-application-status') || '', applicationStatusText: status?.innerText || '' };
}
