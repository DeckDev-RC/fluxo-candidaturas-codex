// Navegação livre da IA numa aba de plataforma, com a mesma máquina do Playwright
// MCP que o Codex usa: snapshot hierárquico de acessibilidade com referências
// (`[ref=e12]`, via `page.ariaSnapshot({ mode: 'ai' })`) e ações por referência
// (`aria-ref=e12`) ou por papel e nome. Os portões do produto ficam aqui: nunca
// digita senha, para em desafio (CAPTCHA/MFA), e ações com efeito para terceiros
// (enviar, aceitar, conectar, excluir…) só com confirmação explícita da pessoa.

import { LER_TEXTO, nomeAcessivel, observarPlano } from './browser-free-observer.mjs';
import { lembrarSnapshot, resolverAlvo, traduzirFalhaDeAcao } from './browser-free-target.mjs';
import { assinaturaDaAcao, createDiagnostics, createLoopGuard, impressaoDoSnapshot } from './browser-free-guard.mjs';

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
// "Enviar mensagem" no perfil só abre o compositor (nada sai); quem envia é o "Enviar"
// de dentro dele, e esse continua no portão. Sem esta exceção a IA parava antes de
// conseguir sequer escrever (achado real do LinkedIn).
const ABRE_COMPOSITOR = /^(enviar|send|escrever|write|nova|new)\s+(uma\s+|a\s+)?(mensagem|message)(\s+(para|to|com|with)\s+.+)?$/i;
export function ehAcaoSensivel(nome) {
  const limpo = String(nome ?? '').replace(/\s+/g, ' ').trim();
  if (ABRE_COMPOSITOR.test(limpo)) return false;
  return ACAO_SENSIVEL.test(limpo);
}

export function createFreeBrowsing({ pageFor, goto, assentar = assentarPadrao, loopGuard = createLoopGuard(), diagnostics = createDiagnostics() }) {
  // Toda ação passa por aqui: impressão antes/depois (changed), detector de loop e
  // diagnóstico de console/rede quando a ação falha ou a página não muda.
  async function agir(platform, acao, executar) {
    const page = await pageFor(platform);
    diagnostics.observar(page);
    const assinatura = assinaturaDaAcao(acao);
    loopGuard.verificar(page, assinatura);
    const inicio = Date.now();
    const antes = await impressaoAtual(page);
    let resultado;
    try {
      // A rede que a ação disparou termina antes de a tela ser lida.
      resultado = await executar(page, async (pagina) => { await diagnostics.assentar(pagina); await assentar(pagina); });
    } catch (error) {
      loopGuard.registrar(page, assinatura, (await impressaoAtual(page)) !== antes);
      const diagnostico = diagnostics.desde(page, inicio);
      if (diagnostico) error.details = { diagnostics: diagnostico };
      throw error;
    }
    const changed = resultado.fingerprint !== antes;
    loopGuard.registrar(page, assinatura, changed);
    const diagnostico = diagnostics.desde(page, inicio);
    return { ...resultado, changed, ...(diagnostico && (!changed || diagnostico.console) ? { diagnostics: diagnostico } : {}) };
  }

  return {
    async observe(platform, opcoes = {}) { const page = await pageFor(platform); diagnostics.observar(page); return snapshot(page, opcoes); },
    async read(platform, { maxChars = TEXTO_MAXIMO } = {}) {
      const page = await pageFor(platform);
      const texto = await page.evaluate(LER_TEXTO);
      const limite = Math.min(Number(maxChars) || TEXTO_MAXIMO, TEXTO_MAXIMO);
      return { url: page.url(), title: await page.title().catch(() => ''), text: texto.slice(0, limite), truncated: texto.length > limite };
    },
    // Tudo que o console e a rede registraram na aba desde que passou a ser observada.
    async diagnostics(platform) {
      const page = await pageFor(platform);
      diagnostics.observar(page);
      return diagnostics.desde(page, 0, { limite: 20 }) ?? { console: [], network: [] };
    },
    async act(platform, acao = {}) {
      const tipo = String(acao.type ?? '');
      if (tipo === 'screenshot') return capturar(await pageFor(platform), acao);
      return agir(platform, acao, (page, assentar) => executarAcao(page, platform, acao, tipo, assentar));
    }
  };

  async function executarAcao(page, platform, acao, tipo, assentar) {
    if (tipo === 'navigate') {
      if (!/^https?:\/\//i.test(String(acao.url))) throw erro('invalid_browser_url', 'A navegação exige uma URL http(s) completa.');
      if (goto) await goto(String(acao.url), platform); else await page.goto(String(acao.url), { waitUntil: 'domcontentloaded' });
    } else if (tipo === 'back') {
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
    } else if (tipo === 'press') {
      const tecla = String(acao.key ?? '');
      if (!TECLA.test(tecla)) throw erro('invalid_key', `Tecla não permitida: ${tecla}. Use letras, números, Enter, Escape, Tab, setas, PageUp/PageDown, Home, End, Backspace, Delete, Space, ou combinações com Control/Shift.`);
      await page.keyboard.press(tecla);
    } else if (tipo === 'scroll' && !acao.ref && !acao.role) {
      await page.mouse.wheel(0, String(acao.direction) === 'up' ? -700 : 700);
    } else if (tipo === 'wait') {
      await esperar(page, acao);
    } else if (['scroll', 'hover', 'click', 'type', 'select'].includes(tipo)) {
      const { locator: elemento, resolvido } = await resolverAlvo(page, acao);
      try {
        if (tipo === 'scroll') await elemento.scrollIntoViewIfNeeded();
        if (tipo === 'hover') await elemento.hover({ timeout: 10_000 });
        if (tipo === 'click') {
          const nome = await elemento.evaluate(nomeAcessivel).catch(() => String(resolvido.name ?? ''));
          if (ehAcaoSensivel(nome) && acao.confirmed !== true) throw erro('confirmation_required', `"${nome}" tem efeito fora do app. Confirme com a pessoa e repita com confirmed=true.`);
          await elemento.click({ timeout: 10_000 });
        }
        if (tipo === 'type') await digitar(elemento, acao);
        if (tipo === 'select') { const valor = String(acao.value ?? ''); try { await elemento.selectOption({ label: valor }); } catch { await elemento.selectOption(valor); } }
      } catch (error) {
        if (['confirmation_required', 'password_field_forbidden', 'type_not_applied'].includes(error?.code)) throw error;
        throw traduzirFalhaDeAcao(error, resolvido);
      }
      await assentar(page);
      // A resposta traz o trecho da página onde a ação aconteceu (diálogo, formulário,
      // seção) com refs novas: é ali que a IA vai agir em seguida (ex.: o compositor
      // de mensagem e o botão "Enviar").
      return { ...(await snapshot(page, { maxChars: 6_000 })), target: resolvido, region: await regiaoDoAlvo(page, elemento) };
    } else {
      throw erro('invalid_browser_action', `Ação desconhecida: ${tipo}`);
    }
    await assentar(page);
    return snapshot(page, { maxChars: Math.min(SNAPSHOT_PADRAO, 8_000) });
  }
}

async function impressaoAtual(page) {
  if (typeof page.ariaSnapshot !== 'function') return impressaoDoSnapshot(page.url(), '');
  return impressaoDoSnapshot(page.url(), await page.ariaSnapshot({ mode: 'ai' }).catch(() => ''));
}

// Digitar: senha e código nunca; editor contenteditable recebe teclas de verdade
// (frameworks como o do LinkedIn só reagem a eventos de teclado); ao final confere
// que o texto entrou. Enter só quando pedido (numa caixa de mensagem, Enter pode
// enviar ou quebrar linha — quem envia é o botão).
async function digitar(elemento, acao) {
  const info = await elemento.evaluate((el) => ({ tipo: `${el.type ?? ''} ${el.name ?? ''} ${el.id ?? ''} ${el.getAttribute('autocomplete') ?? ''} ${el.getAttribute('aria-label') ?? ''}`, editavel: el.isContentEditable === true }));
  if (/password|senha|one-time-code|otp|código de verifica/i.test(info.tipo)) throw erro('password_field_forbidden', 'Senha e código de verificação são da pessoa: peça para ela digitar na aba.');
  const texto = String(acao.text ?? '');
  if (acao.slowly === true || info.editavel) {
    await elemento.click({ timeout: 10_000 });
    await elemento.press('Control+a').catch(() => null);
    await elemento.pressSequentially(texto, { delay: acao.slowly === true ? 40 : 0 });
  } else {
    await elemento.fill(texto);
  }
  const conteudo = await elemento.evaluate((el) => (el.isContentEditable ? el.innerText : el.value ?? '')).catch(() => texto);
  if (texto && !String(conteudo).replace(/\s+/g, ' ').includes(texto.replace(/\s+/g, ' ').slice(0, 40))) throw erro('type_not_applied', 'O texto não entrou no campo. Clique no campo (click) e digite com slowly=true.');
  if (acao.submit === true) await elemento.press('Enter');
}

// Snapshot só do trecho relevante depois da ação: o diálogo que ficou aberto (um
// clique em "Enviar mensagem" abre o compositor em outro lugar da página) ou, sem
// diálogo, o formulário/seção que contém o alvo.
async function regiaoDoAlvo(page, elemento) {
  try {
    const dialogos = page.locator('[role="dialog"], [aria-modal="true"]').filter({ visible: true });
    const abertos = await dialogos.count();
    const regiao = abertos ? dialogos.nth(abertos - 1) : elemento.locator('xpath=ancestor-or-self::*[@role="region" or self::form or self::aside or self::section or self::article][1]');
    if (await regiao.count() !== 1 || typeof regiao.ariaSnapshot !== 'function') return null;
    const yaml = await regiao.ariaSnapshot({ mode: 'ai', timeout: 5_000 });
    return yaml.length > 3_000 ? `${yaml.slice(0, 3_000)}\n… (cortado)` : yaml;
  } catch { return null; }
}

// Snapshot de acessibilidade com refs (o que o MCP do Playwright entrega ao Codex).
// `query` mantém só as linhas que contêm o texto e os ancestrais delas, para a IA
// achar um botão numa página enorme; o limite de tamanho evita estourar o turno.
async function snapshot(page, { query = '', maxChars = SNAPSHOT_PADRAO } = {}) {
  if (typeof page.ariaSnapshot !== 'function') return observarPlano(page, { query });
  let yaml = await page.ariaSnapshot({ mode: 'ai' });
  const completo = yaml;
  lembrarSnapshot(page, yaml);
  const filtro = String(query ?? '').trim().toLocaleLowerCase();
  if (filtro) yaml = filtrarYaml(yaml, filtro);
  const limite = Math.max(1_000, Math.min(Number(maxChars) || SNAPSHOT_PADRAO, SNAPSHOT_MAXIMO));
  const truncated = yaml.length > limite;
  return {
    url: page.url(), title: await page.title().catch(() => ''),
    snapshot: truncated ? `${yaml.slice(0, limite)}\n… (cortado; use query para filtrar ou maxChars para ampliar)` : yaml,
    chars: yaml.length, truncated, filtered: Boolean(filtro), observedAt: new Date().toISOString(),
    fingerprint: impressaoDoSnapshot(page.url(), completo)
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
  const png = ref || role ? await (await resolverAlvo(page, { ref, role, name })).locator.screenshot(opcoes) : await page.screenshot({ ...opcoes, fullPage: false });
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