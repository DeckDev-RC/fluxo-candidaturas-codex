// Navegação livre da IA numa aba de plataforma, com a mesma máquina do Playwright
// MCP que o Codex usa: snapshot hierárquico de acessibilidade com referências
// (`[ref=e12]`, via `page.ariaSnapshot({ mode: 'ai' })`) e ações por referência
// (`aria-ref=e12`) ou por papel e nome. Os portões do produto ficam aqui: nunca
// digita senha, para em desafio (CAPTCHA/MFA), e ações com efeito para terceiros
// (enviar, aceitar, conectar, excluir…) só com confirmação explícita da pessoa.

import { LER_TEXTO, nomeAcessivel, observarPlano } from './browser-free-observer.mjs';

const SNAPSHOT_PADRAO = 12_000;
const SNAPSHOT_MAXIMO = 40_000;
const TEXTO_MAXIMO = 12_000;
const ESPERA_REDE_MS = 6_000;
const ESPERA_TEXTO_MS = 15_000;
const ESPERA_MAXIMA_S = 10;
const TECLA = /^(?:(?:Control|Shift)\+){0,2}(?:[A-Za-z0-9]|Enter|Escape|Tab|Arrow(?:Up|Down|Left|Right)|Page(?:Up|Down)|Home|End|Backspace|Delete|Space)$/;
// Efeito fora do app ou irreversível: exige `confirmed: true`, que a IA só pode
// passar depois de a pessoa dizer sim para essa ação específica.
export const ACAO_SENSIVEL = /\b(enviar|envie|submit|send|candidatar|candidate-se|apply|aceitar|accept|conectar|connect|seguir|follow|pagar|pay|comprar|buy|assinar|subscribe|contratar|excluir|delete|apagar|remover|remove|desativar|deactivate|encerrar conta|sair|logout|publicar|post|comentar|comment|confirmar|confirm)\b/i;

export function createFreeBrowsing({ pageFor, goto, assentar = assentarPadrao }) {
  return {
    async observe(platform, opcoes = {}) { return snapshot(await pageFor(platform), opcoes); },
    async read(platform, { maxChars = TEXTO_MAXIMO } = {}) {
      const page = await pageFor(platform);
      const texto = await page.evaluate(LER_TEXTO);
      const limite = Math.min(Number(maxChars) || TEXTO_MAXIMO, TEXTO_MAXIMO);
      return { url: page.url(), title: await page.title().catch(() => ''), text: texto.slice(0, limite), truncated: texto.length > limite };
    },
    async act(platform, acao = {}) {
      const page = await pageFor(platform);
      const tipo = String(acao.type ?? '');
      if (tipo === 'screenshot') return capturar(page, acao);
      if (tipo === 'navigate') {
        if (!/^https?:\/\//i.test(String(acao.url))) throw erro('invalid_browser_url', 'A navegação exige uma URL http(s) completa.');
        if (goto) await goto(String(acao.url), platform); else await page.goto(String(acao.url), { waitUntil: 'domcontentloaded' });
      } else if (tipo === 'back') {
        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
      } else if (tipo === 'press') {
        const tecla = String(acao.key ?? '');
        if (!TECLA.test(tecla)) throw erro('invalid_key', `Tecla não permitida: ${tecla}. Use letras, números, Enter, Escape, Tab, setas, PageUp/PageDown, Home, End, Backspace, Delete, Space, ou combinações com Control/Shift.`);
        await page.keyboard.press(tecla);
      } else if (tipo === 'scroll') {
        if (acao.ref || acao.role) await (await alvo(page, acao)).scrollIntoViewIfNeeded();
        else await page.mouse.wheel(0, String(acao.direction) === 'up' ? -700 : 700);
      } else if (tipo === 'hover') {
        await (await alvo(page, acao)).hover({ timeout: 10_000 });
      } else if (tipo === 'click') {
        const elemento = await alvo(page, acao);
        const nome = await elemento.evaluate(nomeAcessivel).catch(() => String(acao.name ?? ''));
        if (ACAO_SENSIVEL.test(nome) && acao.confirmed !== true) throw erro('confirmation_required', `"${nome}" tem efeito fora do app. Confirme com a pessoa e repita com confirmed=true.`);
        await elemento.click({ timeout: 10_000 });
      } else if (tipo === 'type') {
        const elemento = await alvo(page, acao);
        const tipoCampo = await elemento.evaluate((el) => `${el.type ?? ''} ${el.name ?? ''} ${el.id ?? ''} ${el.getAttribute('autocomplete') ?? ''} ${el.getAttribute('aria-label') ?? ''}`);
        if (/password|senha|one-time-code|otp|código de verifica/i.test(tipoCampo)) throw erro('password_field_forbidden', 'Senha e código de verificação são da pessoa: peça para ela digitar na aba.');
        if (acao.slowly === true) { await elemento.click({ timeout: 10_000 }); await elemento.pressSequentially(String(acao.text ?? ''), { delay: 40 }); }
        else await elemento.fill(String(acao.text ?? ''));
        if (acao.submit === true) await elemento.press('Enter');
      } else if (tipo === 'select') {
        const elemento = await alvo(page, acao);
        const valor = String(acao.value ?? '');
        try { await elemento.selectOption({ label: valor }); } catch { await elemento.selectOption(valor); }
      } else if (tipo === 'wait') {
        await esperar(page, acao);
      } else {
        throw erro('invalid_browser_action', `Ação desconhecida: ${tipo}`);
      }
      await assentar(page);
      return snapshot(page, { maxChars: Math.min(SNAPSHOT_PADRAO, 8_000) });
    }
  };
}

// Snapshot de acessibilidade com refs (o que o MCP do Playwright entrega ao Codex).
// `query` mantém só as linhas que contêm o texto e os ancestrais delas, para a IA
// achar um botão numa página enorme; o limite de tamanho evita estourar o turno.
async function snapshot(page, { query = '', maxChars = SNAPSHOT_PADRAO } = {}) {
  if (typeof page.ariaSnapshot !== 'function') return observarPlano(page, { query });
  let yaml = await page.ariaSnapshot({ mode: 'ai' });
  const filtro = String(query ?? '').trim().toLocaleLowerCase();
  if (filtro) yaml = filtrarYaml(yaml, filtro);
  const limite = Math.max(1_000, Math.min(Number(maxChars) || SNAPSHOT_PADRAO, SNAPSHOT_MAXIMO));
  const truncated = yaml.length > limite;
  return {
    url: page.url(), title: await page.title().catch(() => ''),
    snapshot: truncated ? `${yaml.slice(0, limite)}\n… (cortado; use query para filtrar ou maxChars para ampliar)` : yaml,
    chars: yaml.length, truncated, filtered: Boolean(filtro), observedAt: new Date().toISOString()
  };
}

function filtrarYaml(yaml, filtro) {
  const linhas = yaml.split('\n');
  const manter = new Set();
  const nivel = (linha) => linha.length - linha.trimStart().length;
  linhas.forEach((linha, indice) => {
    if (!linha.toLocaleLowerCase().includes(filtro)) return;
    manter.add(indice);
    let atual = nivel(linha);
    for (let i = indice - 1; i >= 0 && atual > 0; i -= 1) { if (nivel(linhas[i]) < atual) { manter.add(i); atual = nivel(linhas[i]); } }
  });
  return linhas.filter((_, indice) => manter.has(indice)).join('\n') || '(nada no snapshot contém esse texto)';
}

// Alvo por ref do último snapshot ou por papel e nome (quando a ref já não vale).
async function alvo(page, { ref, role, name }) {
  const id = String(ref ?? '').trim();
  if (id) {
    const match = page.locator(/^[a-z]\d+$/i.test(id) && !id.startsWith('n') ? `aria-ref=${id}` : `[data-fluxo-ref=${JSON.stringify(id)}]`);
    if (await match.count().catch(() => 0) !== 1) throw erro('browser_reference_ambiguous', `A referência ${id} não está mais na página (ela mudou). Observe de novo ou use role e name.`);
    return match;
  }
  if (role && name) {
    const match = page.getByRole(String(role), { name: String(name), exact: false });
    const total = await match.count().catch(() => 0);
    if (total === 1) return match;
    if (total === 0) throw erro('browser_reference_ambiguous', `Nenhum "${role}" com nome "${name}" na página. Observe de novo.`);
    const nomes = await match.evaluateAll((els) => els.slice(0, 6).map((el) => (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 60))).catch(() => []);
    throw erro('browser_reference_ambiguous', `${total} elementos "${role}" casam com "${name}" (${nomes.join(' | ')}). Use a ref do snapshot.`);
  }
  throw erro('browser_reference_required', 'Informe ref (do último snapshot) ou role e name do elemento.');
}

// "Texto" para espera é o que a pessoa lê: conteúdo, rótulo acessível ou placeholder.
function ondeAparece(page, texto) {
  const t = String(texto);
  return page.getByText(t, { exact: false }).or(page.getByLabel(t, { exact: false })).or(page.getByPlaceholder(t, { exact: false })).first();
}

async function esperar(page, { text, textGone, seconds }) {
  if (text) { await ondeAparece(page, text).waitFor({ state: 'visible', timeout: ESPERA_TEXTO_MS }).catch(() => { throw erro('browser_wait_timeout', `"${text}" não apareceu em ${ESPERA_TEXTO_MS / 1000}s.`); }); return; }
  if (textGone) { await ondeAparece(page, textGone).waitFor({ state: 'hidden', timeout: ESPERA_TEXTO_MS }).catch(() => { throw erro('browser_wait_timeout', `"${textGone}" continua na tela após ${ESPERA_TEXTO_MS / 1000}s.`); }); return; }
  const s = Math.min(Math.max(Number(seconds) || 1, 0.2), ESPERA_MAXIMA_S);
  await new Promise((resolve) => setTimeout(resolve, s * 1000));
}

// Captura para o modelo ver a tela: área visível (ou um elemento), nunca gravada.
async function capturar(page, { ref, role, name }) {
  const opcoes = { type: 'png', scale: 'css', timeout: 10_000 };
  const png = ref || role ? await (await alvo(page, { ref, role, name })).screenshot(opcoes) : await page.screenshot({ ...opcoes, fullPage: false });
  const viewport = page.viewportSize?.() ?? null;
  return { url: page.url(), title: await page.title().catch(() => ''), width: viewport?.width ?? null, height: viewport?.height ?? null, imagem: `data:image/png;base64,${png.toString('base64')}` };
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
