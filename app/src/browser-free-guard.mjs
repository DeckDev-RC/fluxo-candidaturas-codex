// Guardas mecânicas da navegação livre: o que o método do Codex pede à IA, mas
// aqui garantido pelo código.
//
// 1. Impressão digital da página (URL + árvore de acessibilidade sem refs) para
//    dizer, depois de cada ação, se a página mudou (`changed`).
// 2. Detector de loop: a mesma ação repetida sem a página mudar é barrada na
//    terceira vez, com a orientação de mudar de estratégia.
// 3. Diagnóstico: erros de console e respostas 4xx/5xx desde a ação, para o
//    modelo saber POR QUE "não aconteceu nada" (POST /login → 403) em vez de
//    repetir o clique.

import { createHash } from 'node:crypto';

export const REPETICOES_ATE_BLOQUEAR = 2;
const MEMORIA_DIAGNOSTICO = 40;
const ITENS_POR_TIPO = 6;

export function impressaoDoSnapshot(url, yaml) {
  // Refs, foco e cursor variam sem a página mudar de fato.
  const semRefs = String(yaml ?? '').replace(/\s*\[(?:ref=[^\]]+|active|cursor=pointer)\]/g, '');
  return createHash('sha256').update(`${url}\n${semRefs}`).digest('hex').slice(0, 12);
}

// Assinatura do que a IA pediu: tipo, alvo e valor, sem o que varia por si só.
export function assinaturaDaAcao(acao = {}) {
  const { type, ref, role, name, text, key, url, direction, value, confirmed } = acao;
  return JSON.stringify({ type, ref, role, name, text, key, url, direction, value, confirmed });
}

export function createLoopGuard() {
  const porPagina = new WeakMap();
  return {
    // Antes de agir: a mesma ação já foi feita N vezes sem a página mudar?
    verificar(page, assinatura) {
      const estado = porPagina.get(page);
      if (estado && estado.assinatura === assinatura && estado.repeticoes >= REPETICOES_ATE_BLOQUEAR) {
        const error = new Error(`Essa mesma ação já foi feita ${estado.repeticoes} vezes e a página não mudou. Não repita: observe com outra consulta, espere um texto (wait), tire um screenshot para ver o que está na tela, tente outro elemento ou pergunte à pessoa.`);
        error.code = 'browser_loop_detected';
        throw error;
      }
    },
    // Depois de agir: registra se a página mudou; repetição só conta quando não mudou.
    registrar(page, assinatura, changed) {
      const anterior = porPagina.get(page);
      const repeticoes = !changed && anterior?.assinatura === assinatura ? anterior.repeticoes + 1 : (changed ? 0 : 1);
      porPagina.set(page, { assinatura, repeticoes });
    }
  };
}

const RECURSOS_QUE_IMPORTAM = new Set(['xhr', 'fetch', 'document']);
const SOSSEGO_MS = 300;
const ESPERA_REDE_MS = 6_000;

export function createDiagnostics({ now = () => Date.now() } = {}) {
  const porPagina = new WeakMap();
  const emVoo = new WeakMap();
  const registrar = (page, item) => {
    const lista = porPagina.get(page) ?? [];
    lista.push({ at: now(), ...item });
    if (lista.length > MEMORIA_DIAGNOSTICO) lista.splice(0, lista.length - MEMORIA_DIAGNOSTICO);
    porPagina.set(page, lista);
  };
  const contar = (page, delta) => emVoo.set(page, Math.max(0, (emVoo.get(page) ?? 0) + delta));
  return {
    // Liga os ouvintes uma vez por página. Nunca guarda corpo, cabeçalho ou query string.
    observar(page) {
      if (porPagina.has(page) || typeof page?.on !== 'function') return;
      porPagina.set(page, []);
      page.on('console', (mensagem) => { if (mensagem.type() === 'error') registrar(page, { kind: 'console', text: curto(mensagem.text()) }); });
      page.on('pageerror', (error) => registrar(page, { kind: 'console', text: curto(error?.message ?? String(error)) }));
      page.on('request', (request) => { if (RECURSOS_QUE_IMPORTAM.has(request.resourceType())) contar(page, +1); });
      page.on('requestfinished', (request) => { if (RECURSOS_QUE_IMPORTAM.has(request.resourceType())) contar(page, -1); });
      page.on('requestfailed', (request) => {
        if (RECURSOS_QUE_IMPORTAM.has(request.resourceType())) contar(page, -1);
        registrar(page, { kind: 'network', method: request.method(), url: semSegredos(request.url()), status: 0, text: curto(request.failure()?.errorText ?? 'falhou') });
      });
      page.on('response', (response) => {
        const request = response.request();
        if (response.status() < 400 || !RECURSOS_QUE_IMPORTAM.has(request.resourceType())) return;
        registrar(page, { kind: 'network', method: request.method(), url: semSegredos(response.url()), status: response.status() });
      });
    },
    // Espera as requisições que a ação disparou (fetch/XHR) terminarem e a página ficar
    // quieta por um instante. `waitForLoadState('networkidle')` não serve: ele resolve
    // na hora se o documento já esteve ocioso antes, e um clique numa SPA não recarrega
    // o documento. Sem isto, a IA lê a tela antes da resposta chegar.
    async assentar(page, { quietMs = SOSSEGO_MS, timeoutMs = ESPERA_REDE_MS } = {}) {
      const limite = now() + timeoutMs;
      let quietoDesde = (emVoo.get(page) ?? 0) === 0 ? now() : null;
      while (now() < limite) {
        const ocupado = (emVoo.get(page) ?? 0) > 0;
        if (ocupado) quietoDesde = null;
        else if (quietoDesde === null) quietoDesde = now();
        else if (now() - quietoDesde >= quietMs) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return false;
    },
    // O que aconteceu desde `desde` (ms), compacto para caber no resultado da ferramenta.
    desde(page, desde) {
      const lista = (porPagina.get(page) ?? []).filter((item) => item.at >= desde);
      const console_ = lista.filter((item) => item.kind === 'console').slice(-ITENS_POR_TIPO).map((item) => item.text);
      const rede = lista.filter((item) => item.kind === 'network').slice(-ITENS_POR_TIPO).map((item) => `${item.method} ${item.url} → ${item.status || item.text}`);
      if (!console_.length && !rede.length) return null;
      return { ...(console_.length ? { console: console_ } : {}), ...(rede.length ? { network: rede } : {}) };
    }
  };
}

function curto(texto) { return String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 200); }

function semSegredos(url) {
  try { const parsed = new URL(url); return `${parsed.origin}${parsed.pathname}`.slice(0, 160); } catch { return String(url).split('?')[0].slice(0, 160); }
}
