import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

// Navegador das plataformas pela interface: página marcadora pública para a aba
// embutida, lista de abas e abertura de uma plataforma pela pessoa.
test('página marcadora é pública e neutra; abas e abertura passam pelo adaptador', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-browser-routes-'));
  const chamadas = [];
  const browserAdapter = {
    async tabs() { return [{ platform: 'GUPY', url: 'https://portal.gupy.io/', loginPending: false, challenge: null }]; },
    async openPlatform(platform, url) { chamadas.push([platform, url]); return { platform, url, loginPending: true, challenge: null }; }
  };
  const server = createServer({ rootDir, requireSession: true, browserAdapter, browserHost: { cdpEndpoint: 'http://127.0.0.1:1' }, platformUrls: () => ({ INFOJOBS: 'https://empresa.infojobs.com.br/{q}' }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // Sem sessão: a marcadora responde, o resto exige autenticação.
    const marcadora = await fetch(`${base}/aba/LINKEDIN`);
    assert.equal(marcadora.status, 200);
    assert.match(marcadora.headers.get('content-type'), /text\/html/);
    const html = await marcadora.text();
    assert.match(html, /Fluxo · LINKEDIN/);
    assert.doesNotMatch(html, /<script/);
    assert.equal((await fetch(`${base}/aba/x%20y`)).status, 401, 'nome fora do padrão não é marcadora pública');
    assert.equal((await fetch(`${base}/api/v1/browser/tabs`)).status, 401);

    const sessao = await fetch(`${base}/api/v1/auth/session`);
    const cookie = sessao.headers.get('set-cookie').split(';')[0];
    const corpoSessao = await sessao.json();
    const { csrfToken } = corpoSessao.data ?? corpoSessao;
    const headers = { cookie, 'content-type': 'application/json', 'x-fluxo-csrf': csrfToken };

    const abas = await (await fetch(`${base}/api/v1/browser/tabs`, { headers })).json();
    assert.equal(abas.embedded, true);
    assert.equal(abas.tabs[0].platform, 'GUPY');

    const aberta = await fetch(`${base}/api/v1/browser/open`, { method: 'POST', headers, body: JSON.stringify({ platform: 'infojobs' }) });
    assert.equal(aberta.status, 200, await aberta.text());
    assert.deepEqual(chamadas, [['INFOJOBS', 'https://empresa.infojobs.com.br/']]);
    const invalida = await fetch(`${base}/api/v1/browser/open`, { method: 'POST', headers, body: JSON.stringify({ platform: 'NADA' }) });
    assert.equal(invalida.status >= 400, true);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('sem adaptador de navegador as rotas dizem que o recurso não existe nesta instalação', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-browser-routes-'));
  const server = createServer({ rootDir, requireSession: false });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const resposta = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/browser/tabs`);
    assert.equal(resposta.status, 503);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
