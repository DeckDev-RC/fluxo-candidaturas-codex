// Scripts que rodam dentro da página para a navegação livre: nome acessível de
// um elemento, texto principal e o observador plano (reserva para páginas onde
// o snapshot de acessibilidade do Playwright não está disponível).

const LIMITE_PADRAO = 60;
const TEXTO_PADRAO = 1500;

// Runs inside the page (também usado para o nome do elemento clicado).
export function nomeAcessivel(el) {
  const limpo = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
  const porId = el.getAttribute('aria-labelledby')?.split(/\s+/).map((id) => document.getElementById(id)?.innerText).filter(Boolean).join(' ');
  const rotulo = el.labels?.[0];
  const textoDoRotulo = rotulo ? [...rotulo.childNodes].filter((no) => no !== el && !(no.contains && no.contains(el))).map((no) => no.textContent).join(' ') : '';
  const proprio = el.tagName === 'SELECT' ? '' : el.innerText;
  return limpo(el.getAttribute('aria-label') || porId || textoDoRotulo || proprio || el.value || el.placeholder || el.title || el.getAttribute('alt') || el.querySelector?.('img')?.getAttribute('alt') || el.name || '').slice(0, 120);
}

// Runs inside the page. Lista plana de elementos interativos visíveis com
// referência própria (data-fluxo-ref); os que estão na tela vêm primeiro.
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
    if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.type !== 'password' && el.value) item.value = limpo(el.value).slice(0, 80);
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
export const OBSERVAR_PLANO = new Function('args', `const nomeAcessivel = ${nomeAcessivel.toString()}; return (${observeFree.toString()})(args, nomeAcessivel);`);
// eslint-disable-next-line no-new-func
export const LER_TEXTO = new Function(`return (${readText.toString()})();`);

export async function observarPlano(page, { limit = LIMITE_PADRAO, query = '' } = {}) {
  const observado = await page.evaluate(OBSERVAR_PLANO, { limit: Math.max(1, Math.min(Number(limit) || LIMITE_PADRAO, 200)), query: String(query ?? ''), texto: TEXTO_PADRAO });
  return { ...observado, observedAt: new Date().toISOString() };
}
