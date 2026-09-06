import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { platformOfUrl } from './platform-search.mjs';
import { CARTOES_DE_VAGA, EMPRESA_DESCONHECIDA, lerCartoesDeVaga } from './platform-cards.mjs';

// O leitor de cartões entra na página junto com o catálogo, como texto.
// eslint-disable-next-line no-new-func
const OBSERVAR_PAGINA = new Function('args', `const [catalogo, empresaDesconhecida] = args; const lerCartoesDeVaga = ${lerCartoesDeVaga.toString()}; return (${observePage.toString()})(catalogo, empresaDesconhecida, lerCartoesDeVaga);`);
// Páginas de busca renderizam a lista depois do HTML: esperar a rede assentar
// evita fotografar a página antes das vagas aparecerem.
const ESPERA_RENDERIZACAO_MS = 8_000;
async function assentar(page) { await page.waitForLoadState('networkidle', { timeout: ESPERA_RENDERIZACAO_MS }).catch(() => {}); }
const ARGUMENTOS_DA_PAGINA = [CARTOES_DE_VAGA, EMPRESA_DESCONHECIDA];

// The driver owns the browser process; importing it or reading local state never launches Chromium.
// Uma aba por plataforma: a URL decide em qual aba a navegação acontece, e a
// pessoa vê cada site no próprio lugar quando a IA conduz.
export function createPlaywrightDriver({ rootDir, headless = false, browserType, page: suppliedPage } = {}) {
  let context; let page = suppliedPage; let starting;
  const abas = new Map();
  let ativa = '';

  async function getContext() {
    if (context) return context;
    if (!starting) starting = (async () => {
      const chromium = browserType ?? (await import('playwright')).chromium;
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
    // A primeira plataforma reaproveita a aba inicial em branco; as demais abrem a própria.
    const disponivel = !abas.size && ctx.pages()[0] && ctx.pages()[0].url() === 'about:blank' ? ctx.pages()[0] : await ctx.newPage();
    disponivel.setDefaultTimeout(15_000);
    disponivel.once('close', () => { if (abas.get(nome) === disponivel) abas.delete(nome); if (ativa === nome) ativa = ''; });
    abas.set(nome, disponivel);
    return disponivel;
  }

  async function locator(ref) {
    const current = await getPage();
    const match = ref === 'submit'
      ? current.locator('button[type="submit"], input[type="submit"]')
      : current.locator('[data-fluxo-ref]').filter({ visible: true }).and(current.locator(`[data-fluxo-ref=${JSON.stringify(String(ref))}]`));
    if (await match.count() !== 1) throw error('browser_reference_ambiguous', 'Capture novamente a página e selecione uma referência única.');
    return match;
  }

  return {
    async goto(url) {
      if (!/^https?:\/\//i.test(String(url))) throw error('invalid_browser_url', 'A navegação exige uma URL HTTP ou HTTPS.');
      const plataforma = platformOfUrl(url);
      const alvo = plataforma ? await pageFor(plataforma) : await getPage();
      ativa = plataforma;
      await alvo.goto(String(url), { waitUntil: 'domcontentloaded' });
      await assentar(alvo);
    },
    // Abre a plataforma na própria aba, traz para a frente e diz se a pessoa precisa entrar.
    async openPlatform(platform, url) {
      const alvo = await pageFor(platform);
      ativa = String(platform).toUpperCase();
      await alvo.goto(String(url), { waitUntil: 'domcontentloaded' });
      await assentar(alvo);
      await alvo.bringToFront().catch(() => {});
      return { platform: ativa, ...(await alvo.evaluate(observeLogin)) };
    },
    async loginState(platform) {
      const alvo = platform ? abas.get(String(platform).toUpperCase()) : await getPage();
      if (!alvo || alvo.isClosed()) return { platform: String(platform ?? '').toUpperCase(), open: false };
      return { platform: String(platform ?? '').toUpperCase(), open: true, ...(await alvo.evaluate(observeLogin)) };
    },
    async tabs() {
      const lista = [];
      for (const [plataforma, aba] of abas) {
        if (aba.isClosed()) continue;
        lista.push({ platform: plataforma, ...(await aba.evaluate(observeLogin).catch(() => ({ url: aba.url(), title: '', challenge: null, loginPending: false }))) });
      }
      return lista;
    },
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
    async close() { if (context) await context.close(); context = null; page = suppliedPage; abas.clear(); ativa = ''; starting = null; }
  };
}

function error(code, message) { return Object.assign(new Error(message), { code }); }

// Runs inside the page: só o necessário para saber se a pessoa precisa entrar.
function observeLogin() {
  const text = document.body?.innerText ?? '';
  const challenge = /captcha/i.test(text) ? 'captcha' : /\bmfa\b|two.factor|multifator|c[oó]digo de verifica/i.test(text) ? 'mfa' : /(verifica|autentica|reconhecimento)\w*\s+(facial|biom\w+)|biometr\w+\s+(verification|authentication|check)/i.test(text) ? 'biometric' : null;
  const senha = Boolean(document.querySelector('input[type="password"]'));
  const urlDeLogin = /login|signin|sign-in|entrar|auth|autentica|checkpoint/i.test(location.pathname + location.search);
  return { url: location.href, title: document.title, challenge, loginPending: senha || urlDeLogin };
}

// Runs inside the observed page. Only rendered facts and explicit structured job metadata are returned.
// `lerCartoes` chega como argumento porque a função é serializada para a página.
function observePage(catalogo = {}, empresaDesconhecida = '', lerCartoes = () => []) {
  const text = document.body?.innerText ?? '';
  const challenge = /captcha/i.test(text) ? 'captcha' : /\bmfa\b|two.factor|multifator/i.test(text) ? 'mfa' : /(verifica|autentica|reconhecimento)\w*\s+(facial|biom\w+)|biometr\w+\s+(verification|authentication|check)/i.test(text) ? 'biometric' : null;
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
