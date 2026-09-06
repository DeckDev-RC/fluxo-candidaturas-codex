// Navegação livre da IA numa aba de plataforma: observar a página como uma lista
// de elementos com referência (o que se vê e onde se clica), e agir sobre eles —
// clicar, digitar, selecionar, teclar, rolar, voltar, navegar. É o que permite
// tarefas fora das ferramentas de domínio (ler convites, analisar perfis, achar
// uma página). Os portões continuam aqui: nunca digita senha, para em desafio
// (CAPTCHA/MFA), e ações com efeito para terceiros (enviar, aceitar, conectar,
// excluir…) só com confirmação explícita da pessoa.

const LIMITE_PADRAO = 60;
const TEXTO_PADRAO = 1500;
const TEXTO_MAXIMO = 12_000;
const ESPERA_REDE_MS = 6_000;
const TECLAS = new Set(['Enter', 'Escape', 'Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End', 'Backspace', 'Space']);
// Efeito fora do app ou irreversível: exige `confirmed: true`, que a IA só pode
// passar depois de a pessoa dizer sim para essa ação específica.
export const ACAO_SENSIVEL = /\b(enviar|envie|submit|send|candidatar|candidate-se|apply|aceitar|accept|conectar|connect|seguir|follow|pagar|pay|comprar|buy|assinar|subscribe|contratar|excluir|delete|apagar|remover|remove|desativar|deactivate|encerrar conta|sair|logout|publicar|post|comentar|comment|confirmar|confirm)\b/i;

export function createFreeBrowsing({ pageFor, goto, assentar = assentarPadrao }) {
  return {
    async observe(platform, { limit = LIMITE_PADRAO, query = '' } = {}) {
      const page = await pageFor(platform);
      return observarPagina(page, { limit, query });
    },
    async read(platform, { maxChars = TEXTO_MAXIMO } = {}) {
      const page = await pageFor(platform);
      const texto = await page.evaluate(LER_TEXTO);
      return { url: page.url(), title: await page.title().catch(() => ''), text: texto.slice(0, Math.min(Number(maxChars) || TEXTO_MAXIMO, TEXTO_MAXIMO)), truncated: texto.length > maxChars };
    },
    async act(platform, acao = {}) {
      const page = await pageFor(platform);
      const tipo = String(acao.type ?? '');
      if (tipo === 'navigate') {
        // A regra de endereço público fica na ferramenta (fronteira com a IA); aqui só http(s).
        if (!/^https?:\/\//i.test(String(acao.url))) throw erro('invalid_browser_url', 'A navegação exige uma URL http(s) completa.');
        if (goto) await goto(String(acao.url), platform); else await page.goto(String(acao.url), { waitUntil: 'domcontentloaded' });
      } else if (tipo === 'back') {
        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
      } else if (tipo === 'press') {
        if (!TECLAS.has(String(acao.key))) throw erro('invalid_key', `Tecla não permitida: ${acao.key}. Use ${[...TECLAS].join(', ')}.`);
        await page.keyboard.press(String(acao.key));
      } else if (tipo === 'scroll') {
        if (acao.ref) await (await alvo(page, acao.ref)).scrollIntoViewIfNeeded();
        else await page.mouse.wheel(0, String(acao.direction) === 'up' ? -700 : 700);
      } else if (tipo === 'click') {
        const elemento = await alvo(page, acao.ref);
        const nome = await elemento.evaluate(nomeAcessivel);
        if (ACAO_SENSIVEL.test(nome) && acao.confirmed !== true) throw erro('confirmation_required', `"${nome}" tem efeito fora do app. Confirme com a pessoa e repita com confirmed=true.`);
        await elemento.click({ timeout: 10_000 });
      } else if (tipo === 'type') {
        const elemento = await alvo(page, acao.ref);
        const tipoCampo = await elemento.evaluate((el) => `${el.type ?? ''} ${el.name ?? ''} ${el.id ?? ''} ${el.getAttribute('autocomplete') ?? ''}`);
        if (/password|senha|one-time-code|otp/i.test(tipoCampo)) throw erro('password_field_forbidden', 'Senha e código de verificação são da pessoa: peça para ela digitar na aba.');
        await elemento.fill(String(acao.text ?? ''));
        if (acao.submit === true) await elemento.press('Enter');
      } else if (tipo === 'select') {
        const elemento = await alvo(page, acao.ref);
        const valor = String(acao.value ?? '');
        try { await elemento.selectOption({ label: valor }); } catch { await elemento.selectOption(valor); }
      } else {
        throw erro('invalid_browser_action', `Ação desconhecida: ${tipo}`);
      }
      await assentar(page);
      return observarPagina(page, { limit: 30 });
    }
  };
}

async function observarPagina(page, { limit, query }) {
  const observado = await page.evaluate(OBSERVAR_LIVRE, { limit: Math.max(1, Math.min(Number(limit) || LIMITE_PADRAO, 200)), query: String(query ?? ''), texto: TEXTO_PADRAO });
  return { ...observado, observedAt: new Date().toISOString() };
}

async function alvo(page, ref) {
  const id = String(ref ?? '').trim();
  if (!id) throw erro('browser_reference_required', 'Informe a referência (ref) do elemento, vinda de fluxo_browser_observe.');
  const match = page.locator(`[data-fluxo-ref=${JSON.stringify(id)}]`);
  if (await match.count() !== 1) throw erro('browser_reference_ambiguous', 'A referência não está mais na página. Observe de novo e use uma referência atual.');
  return match;
}

async function assentarPadrao(page) {
  await page.waitForLoadState('networkidle', { timeout: ESPERA_REDE_MS }).catch(() => null);
}

// Só http(s) público: nada de arquivo local, rede interna ou o próprio app.
export function assertUrlPublica(url) {
  let parsed;
  try { parsed = new URL(String(url)); } catch { throw erro('invalid_browser_url', 'A navegação exige uma URL http(s) completa.'); }
  if (!/^https?:$/.test(parsed.protocol)) throw erro('invalid_browser_url', 'A navegação exige uma URL http(s).');
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.endsWith('.local') || host === '::1' || host === '[::1]') throw erro('invalid_browser_url', 'Endereços locais ou de rede interna não são navegáveis pela IA.');
  return parsed.toString();
}

function erro(code, message) { return Object.assign(new Error(message), { code }); }

// Runs inside the page (também usado pelo `alvo` para o nome do elemento clicado).
function nomeAcessivel(el) {
  const limpo = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
  const porId = el.getAttribute('aria-labelledby')?.split(/\s+/).map((id) => document.getElementById(id)?.innerText).filter(Boolean).join(' ');
  // Rótulo que envolve o controle ("Ordenar <select>"): só o texto do rótulo, sem o do controle.
  const rotulo = el.labels?.[0];
  const textoDoRotulo = rotulo ? [...rotulo.childNodes].filter((no) => no !== el && !(no.contains && no.contains(el))).map((no) => no.textContent).join(' ') : '';
  const proprio = el.tagName === 'SELECT' ? '' : el.innerText;
  return limpo(el.getAttribute('aria-label') || porId || textoDoRotulo || proprio || el.value || el.placeholder || el.title || el.getAttribute('alt') || el.querySelector?.('img')?.getAttribute('alt') || el.name || '').slice(0, 120);
}

// Runs inside the page. Elementos interativos visíveis, com referência estável
// (data-fluxo-ref) para as ações; os que estão na tela vêm primeiro.
function observeFree({ limit, query, texto }, nome) {
  const limpo = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
  const visivel = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const naTela = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
  const papel = (el) => el.getAttribute('role') || ({ A: 'link', BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox', SUMMARY: 'button' })[el.tagName] || (el.tagName === 'INPUT' ? ({ checkbox: 'checkbox', radio: 'radio', submit: 'button', button: 'button', file: 'file' })[el.type] || 'textbox' : el.isContentEditable ? 'textbox' : 'generic');
  window.__fluxoRefSeq = window.__fluxoRefSeq || 0;
  const candidatos = [...document.querySelectorAll('a[href], button, input:not([type="hidden"]), textarea, select, summary, [contenteditable="true"], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="combobox"], [role="textbox"], [role="option"], [role="switch"]')]
    .filter((el) => visivel(el) && !el.closest('[data-fluxo-ignore]'));
  const filtro = limpo(query).toLocaleLowerCase();
  const itens = [];
  for (const el of candidatos) {
    if (!el.getAttribute('data-fluxo-ref')) el.setAttribute('data-fluxo-ref', `n${++window.__fluxoRefSeq}`);
    const rotulo = nome(el);
    const role = papel(el);
    if (filtro && !`${rotulo} ${role} ${el.href ?? ''}`.toLocaleLowerCase().includes(filtro)) continue;
    const item = { ref: el.getAttribute('data-fluxo-ref'), role, name: rotulo, onScreen: naTela(el) };
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') item.disabled = true;
    if (el.type === 'checkbox' || el.type === 'radio' || el.getAttribute('role') === 'checkbox' || el.getAttribute('role') === 'switch') item.checked = el.checked ?? el.getAttribute('aria-checked') === 'true';
    if (el.tagName === 'A' && el.href) item.href = el.href.slice(0, 160);
    if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !/password/i.test(el.type)) { if (el.value) item.value = limpo(el.value).slice(0, 80); if (el.type === 'password') item.value = undefined; }
    if (el.type === 'password') item.role = 'password';
    if (el.tagName === 'SELECT') item.options = [...el.options].slice(0, 20).map((o) => limpo(o.label || o.text)).filter(Boolean);
    itens.push(item);
  }
  itens.sort((a, b) => Number(b.onScreen) - Number(a.onScreen));
  const principal = document.querySelector('main, [role="main"], article') ?? document.body;
  const cabecalhos = [...document.querySelectorAll('h1, h2')].filter(visivel).slice(0, 8).map((h) => limpo(h.innerText)).filter(Boolean);
  const corpo = limpo(principal.innerText ?? '');
  return {
    url: location.href, title: document.title, headings: cabecalhos,
    text: corpo.slice(0, texto), textLength: corpo.length,
    elements: itens.slice(0, limit), totalElements: itens.length,
    scroll: { y: Math.round(scrollY), max: Math.max(0, Math.round(document.documentElement.scrollHeight - innerHeight)) }
  };
}

function readText() {
  const principal = document.querySelector('main, [role="main"], article') ?? document.body;
  return String(principal.innerText ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// eslint-disable-next-line no-new-func
const OBSERVAR_LIVRE = new Function('args', `const nomeAcessivel = ${nomeAcessivel.toString()}; return (${observeFree.toString()})(args, nomeAcessivel);`);
// eslint-disable-next-line no-new-func
const LER_TEXTO = new Function(`return (${readText.toString()})();`);
