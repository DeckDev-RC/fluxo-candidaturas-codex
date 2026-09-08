import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { assinaturaDaAcao, createDiagnostics, createLoopGuard, impressaoDoSnapshot, REPETICOES_ATE_BLOQUEAR } from '../src/browser-free-guard.mjs';

// Guardas mecânicas da navegação livre, sem navegador: impressão da página,
// detector de loop e diagnóstico de console/rede.

test('a impressão da página ignora refs, foco e cursor, e muda quando o conteúdo muda', () => {
  const a = impressaoDoSnapshot('https://x.test/', '- button "Entrar" [ref=e4]\n- link "Ajuda" [ref=e5] [cursor=pointer]');
  const b = impressaoDoSnapshot('https://x.test/', '- button "Entrar" [active] [ref=f2e9]\n- link "Ajuda" [ref=e7]');
  const c = impressaoDoSnapshot('https://x.test/', '- button "Entrar" [ref=e4]\n- link "Ajuda" [ref=e5]\n- text: Redefina a senha');
  assert.equal(a, b, 'refs novas e foco não são mudança');
  assert.notEqual(a, c, 'texto novo é mudança');
  assert.notEqual(a, impressaoDoSnapshot('https://x.test/outra', '- button "Entrar" [ref=e4]\n- link "Ajuda" [ref=e5]'), 'URL diferente é mudança');
  assert.equal(a.length, 12);
});

test('a assinatura da ação cobre o que a IA pediu e ignora o resto', () => {
  assert.equal(assinaturaDaAcao({ type: 'click', role: 'button', name: 'Entrar' }), assinaturaDaAcao({ type: 'click', role: 'button', name: 'Entrar', platform: 'X' }));
  assert.notEqual(assinaturaDaAcao({ type: 'click', role: 'button', name: 'Entrar' }), assinaturaDaAcao({ type: 'click', role: 'button', name: 'Entrar', approvalId: 'approval-1' }), 'repetir com approvalId é outra ação');
  assert.notEqual(assinaturaDaAcao({ type: 'type', ref: 'e1', text: 'a' }), assinaturaDaAcao({ type: 'type', ref: 'e1', text: 'b' }));
});

test('o detector de loop barra a mesma ação repetida sem a página mudar, e zera quando muda', () => {
  const guard = createLoopGuard();
  const page = {};
  const acao = assinaturaDaAcao({ type: 'click', role: 'button', name: 'Entrar' });
  for (let i = 0; i < REPETICOES_ATE_BLOQUEAR; i += 1) { guard.verificar(page, acao); guard.registrar(page, acao, false); }
  assert.throws(() => guard.verificar(page, acao), (erro) => erro.code === 'browser_loop_detected' && /observe|screenshot|pergunte/.test(erro.message));
  // Outra ação passa; outra página também.
  guard.verificar(page, assinaturaDaAcao({ type: 'click', role: 'button', name: 'Ajuda' }));
  guard.verificar({}, acao);
  // A ação que muda a página zera a contagem para ela.
  guard.registrar(page, acao, true);
  guard.verificar(page, acao);
  guard.registrar(page, acao, false);
  guard.verificar(page, acao);
});

test('o diagnóstico guarda erros de console e respostas 4xx/5xx sem query string, e só desde a ação', () => {
  let agora = 1_000;
  const diagnostics = createDiagnostics({ now: () => agora });
  const page = new EventEmitter();
  diagnostics.observar(page); diagnostics.observar(page);
  assert.equal(page.listenerCount('response'), 1, 'ouvintes ligados uma vez por página');
  const resposta = (status, url, tipo = 'fetch', method = 'POST') => ({ status: () => status, url: () => url, request: () => ({ resourceType: () => tipo, method: () => method }) });
  page.emit('response', resposta(200, 'https://api.test/ok'));
  page.emit('response', resposta(403, 'https://api.test/login?token=segredo'));
  page.emit('response', resposta(500, 'https://cdn.test/img.png', 'image', 'GET'));
  page.emit('console', { type: () => 'warning', text: () => 'aviso' });
  page.emit('console', { type: () => 'error', text: () => 'AuthError: sessão inválida' });
  page.emit('requestfailed', { method: () => 'GET', url: () => 'https://api.test/feed?x=1', resourceType: () => 'xhr', failure: () => ({ errorText: 'net::ERR_FAILED' }) });
  const desde = diagnostics.desde(page, 1_000);
  assert.deepEqual(desde, { console: ['AuthError: sessão inválida'], network: ['POST https://api.test/login → 403', 'GET https://api.test/feed → net::ERR_FAILED'] });
  assert.equal(diagnostics.desde(page, 2_000), null, 'nada depois desse instante');
  assert.equal(diagnostics.desde({}, 0), null, 'página não observada não tem diagnóstico');
});

test('assentar espera as requisições que importam terminarem e a página sossegar', async () => {
  let agora = 0;
  const diagnostics = createDiagnostics({ now: () => agora });
  const page = new EventEmitter();
  diagnostics.observar(page);
  const pedido = (tipo) => ({ resourceType: () => tipo, method: () => 'GET', url: () => 'https://x.test/a' });
  page.emit('request', pedido('fetch'));
  page.emit('request', pedido('image')); // imagem não segura a espera
  const espera = diagnostics.assentar(page, { quietMs: 100, timeoutMs: 2_000 });
  // Enquanto o fetch está em voo, o relógio anda e nada assenta.
  await new Promise((resolve) => setTimeout(resolve, 60)); agora = 500;
  page.emit('requestfinished', pedido('fetch'));
  await new Promise((resolve) => setTimeout(resolve, 60)); agora = 700;
  assert.equal(await espera, true);
  // Sem nada em voo desde o início, assenta assim que o sossego passa.
  agora = 1_000;
  const rapida = diagnostics.assentar(page, { quietMs: 50, timeoutMs: 1_000 });
  await new Promise((resolve) => setTimeout(resolve, 60)); agora = 1_100;
  assert.equal(await rapida, true);
  // Requisição que nunca termina: desiste no limite e devolve false.
  page.emit('request', pedido('xhr'));
  agora = 2_000;
  const presa = diagnostics.assentar(page, { quietMs: 50, timeoutMs: 100 });
  await new Promise((resolve) => setTimeout(resolve, 60)); agora = 2_200;
  assert.equal(await presa, false);
});
