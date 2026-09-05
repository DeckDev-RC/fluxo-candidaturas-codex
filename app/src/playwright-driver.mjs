import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

// The driver owns the browser process; importing it or reading local state never launches Chromium.
export function createPlaywrightDriver({ rootDir, headless = false, browserType, page: suppliedPage } = {}) {
  let context; let page = suppliedPage; let starting;
  async function getPage() {
    if (page && !page.isClosed()) return page;
    if (!starting) starting = (async () => {
      const chromium = browserType ?? (await import('playwright')).chromium;
      await mkdir(join(rootDir, 'estado', 'browser-profile'), { recursive: true });
      context = await chromium.launchPersistentContext(join(rootDir, 'estado', 'browser-profile'), { headless, viewport: { width: 1280, height: 900 } });
      page = context.pages()[0] ?? await context.newPage();
      page.setDefaultTimeout(15_000);
      return page;
    })().catch(error => { starting = null; throw error; });
    return starting;
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
      const current = await getPage(); await current.goto(String(url), { waitUntil: 'domcontentloaded' });
    },
    async snapshot() { const current = await getPage(); const observed = await current.evaluate(observePage); const formHash = createHash('sha256').update(JSON.stringify(observed.formValues)).digest('hex'); return { ...observed, formHash, observedAt: new Date().toISOString() }; },
    async state() { return this.snapshot(); },
    async fill(ref, value) { const field = await locator(ref); if (await field.getAttribute('type') === 'file') throw error('browser_upload_required', 'Use a operação explícita de anexo.'); await field.fill(String(value)); },
    async click(ref) { await (await locator(ref)).click(); },
    async upload(ref, path) {
      const absolute = resolve(rootDir, path); const rel = relative(join(rootDir, 'curriculo'), absolute);
      if (rel.startsWith('..') || resolve(absolute) === resolve(rootDir)) throw error('invalid_resume_path', 'Anexe um arquivo da pasta curriculo.');
      await (await locator(ref)).setInputFiles(absolute);
    },
    async screenshot(path) {
      const absolute = resolve(rootDir, path); const rel = relative(rootDir, absolute);
      if (rel.startsWith('..')) throw error('invalid_evidence_path', 'A evidência deve permanecer na pasta local.');
      await mkdir(dirname(absolute), { recursive: true });
      await (await getPage()).screenshot({ path: absolute, fullPage: true });
      return { ok: true, path };
    },
    async close() { if (context) await context.close(); context = null; page = suppliedPage; starting = null; }
  };
}

function error(code, message) { return Object.assign(new Error(message), { code }); }

// Runs inside the observed page. Only rendered facts and explicit structured job metadata are returned.
function observePage() {
  const text = document.body?.innerText ?? '';
  const challenge = /captcha/i.test(text) ? 'captcha' : /\bmfa\b|two.factor|multifator/i.test(text) ? 'mfa' : /biometr/i.test(text) ? 'biometric' : null;
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
  const confirmation = document.querySelector('[data-confirmation], [role="status"], .application-confirmation');
  const jobId = confirmation?.getAttribute('data-job-id') || document.body?.getAttribute('data-job-id') || '';
  const jobUrl = confirmation?.getAttribute('data-job-url') || document.body?.getAttribute('data-job-url') || '';
  const status = document.querySelector('[data-application-status]');
  return { url: location.href, text, challenge, fields, fieldDetails, formValues, links, ...(jobs.length ? { jobs } : {}), jobId, jobUrl, confirmationText: confirmation?.innerText || '', emptyResults: Boolean(document.querySelector('[data-empty-results]')), applicationStatus: status?.getAttribute('data-application-status') || '', applicationStatusText: status?.innerText || '' };
}
