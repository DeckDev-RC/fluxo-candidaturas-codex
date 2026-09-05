import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, resolveStaticAsset } from '../src/http-server.mjs';

test('GET / entrega a interface do candidato sem expor segredo', async () => {
  const server = createServer({ rootDir: await mkdtemp(join(tmpdir(), 'fluxo-harness-ui-')) });
  const address = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    // A casca declara as áreas do candidato, não ferramentas de implementação.
    for (const rota of ['agora', 'oportunidades', 'candidaturas', 'perfil', 'configuracoes', 'ajuda']) {
      assert.match(body, new RegExp(`href="#${rota}"`), `a navegação precisa oferecer ${rota}`);
    }
    assert.match(body, /objetivo-texto/);
    assert.match(body, /indicador-decisoes/);
    assert.match(body, /Ir para o conteúdo/);
    assert.equal(body.includes('GUPY_PASSWORD'), false);
    assert.equal(/\brun\b|streaming|preflight|payload/i.test(body), false, 'a casca não usa vocabulário de implementação');
  } finally {
    await close(server);
  }
});

test('módulos e estilos da interface são servidos e travessia de caminho é recusada', async () => {
  const server = createServer({ rootDir: await mkdtemp(join(tmpdir(), 'fluxo-harness-ui-')) });
  const address = await listen(server);
  const alvos = [
    ['/app.js', /^text\/javascript/],
    ['/core/store.mjs', /^text\/javascript/],
    ['/screens/agora.mjs', /^text\/javascript/],
    ['/ui/dialog.mjs', /^text\/javascript/],
    ['/styles/tokens.css', /^text\/css/],
    ['/styles/components.css', /^text\/css/],
    ['/favicon.svg', /^image\/svg\+xml/],
    ['/fixtures/ui-state.json', /^application\/json/]
  ];

  try {
    for (const [caminho, tipo] of alvos) {
      const resposta = await fetch(`http://127.0.0.1:${address.port}${caminho}`);
      assert.equal(resposta.status, 200, `${caminho} precisa ser servido`);
      assert.match(resposta.headers.get('content-type'), tipo);
    }
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/../README.md`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/nao-existe.mjs`)).status, 404);
  } finally {
    await close(server);
  }
});

test('resolução de arquivo estático recusa caminho fora da pasta e extensão desconhecida', () => {
  assert.deepEqual(resolveStaticAsset('/'), ['index.html', 'text/html; charset=utf-8']);
  assert.deepEqual(resolveStaticAsset('/core/api.mjs'), ['core/api.mjs', 'text/javascript; charset=utf-8']);
  assert.equal(resolveStaticAsset('/../.env'), null);
  assert.equal(resolveStaticAsset('/core/../../.env'), null);
  assert.equal(resolveStaticAsset('/estado/fluxo.sqlite'), null);
  assert.equal(resolveStaticAsset('/arquivo.txt'), null);
  assert.equal(resolveStaticAsset('/caminho com espaço.js'), null);
});

test('todo módulo importado pela interface existe na pasta servida', async () => {
  const { readFile } = await import('node:fs/promises');
  const visitados = new Set();
  const pendentes = ['app.js'];
  while (pendentes.length) {
    const atual = pendentes.pop();
    if (visitados.has(atual)) continue;
    visitados.add(atual);
    const conteudo = await readFile(new URL(`../public/${atual}`, import.meta.url), 'utf8');
    for (const [, referencia] of conteudo.matchAll(/from '([.][^']+)'/g)) {
      const resolvido = new URL(referencia, new URL(`../public/${atual}`, import.meta.url)).pathname
        .split('/public/').at(-1);
      assert.ok(resolveStaticAsset(`/${resolvido}`), `${referencia} precisa ser servível`);
      pendentes.push(resolvido);
    }
  }
  assert.ok(visitados.size >= 15, `a interface deve estar modular; módulos encontrados: ${visitados.size}`);
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
