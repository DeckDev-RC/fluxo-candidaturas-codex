import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlaywrightDriver } from '../app/src/playwright-driver.mjs';
import { assertUrlPublica } from '../app/src/browser-free.mjs';

// Navegação livre em Chromium real: a IA vê a página como elementos com ref e age
// sobre eles. Os portões são verificados no navegador de verdade: senha recusada,
// ação sensível só confirmada, referência velha rejeitada.

const PAGINAS = {
  '/convites': `<main><h1>Convites</h1>
    <form action="/busca" method="get"><label for="q">Pesquisar</label><input id="q" name="q" type="text" placeholder="Buscar pessoas"></form>
    <ul>
      <li><a href="/in/kelvin">Pessoa Alfa B.</a> quer se conectar. <button type="button" onclick="this.closest('li').textContent='Convite de Pessoa Alfa aceito'">Aceitar</button></li>
      <li><a href="/in/ana">Pessoa Teste P.</a> quer se conectar. <button type="button">Aceitar</button> <button type="button">Ignorar</button></li>
    </ul>
    <label>Ordenar <select id="ordem"><option>Recentes</option><option value="old">Antigos</option></select></label>
    <label for="senha">Senha</label><input id="senha" type="password">
    <div style="height:2000px"></div><a href="/rodape" id="rodape">Rodapé</a></main>`,
  '/busca': '<main><h1>Resultados</h1><p>Você buscou por <span id="termo"></span>.</p><script>document.getElementById("termo").textContent=new URLSearchParams(location.search).get("q")</script></main>',
  '/in/kelvin': '<main><h1>Pessoa Alfa B.</h1><p>Product Engineer. I build interfaces and the reliability behind them.</p></main>'
};

test('navegação livre: observar com refs, digitar e buscar, clicar com portões, ler e voltar', { timeout: 60_000 }, async (t) => {
  const servidor = createServer((request, response) => { const caminho = request.url.split('?')[0]; response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(`<!doctype html><title>Teste livre</title>${PAGINAS[caminho] ?? '<h1>Nada</h1>'}`); });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const driver = createPlaywrightDriver({ rootDir: await mkdtemp(join(tmpdir(), 'fluxo-livre-')), headless: true });
  t.after(async () => { await driver.close(); await new Promise((resolve) => servidor.close(resolve)); });

  await driver.act('LINKEDIN', { type: 'navigate', url: `${base}/convites` });
  const visto = await driver.observe('LINKEDIN', {});
  assert.equal(visto.title, 'Teste livre');
  assert.deepEqual(visto.headings, ['Convites']);
  const porNome = (nome, role) => visto.elements.filter((el) => el.name === nome && (!role || el.role === role));
  assert.equal(porNome('Aceitar', 'button').length, 2, 'dois botões com o mesmo nome têm refs distintas');
  assert.notEqual(porNome('Aceitar')[0].ref, porNome('Aceitar')[1].ref);
  assert.equal(porNome('Pessoa Alfa B.', 'link')[0].href, `${base}/in/kelvin`);
  assert.deepEqual(porNome('Ordenar', 'combobox')[0].options, ['Recentes', 'Antigos']);
  assert.equal(porNome('Senha')[0].role, 'password', 'campo de senha é identificado, sem valor');
  const rodape = visto.elements.find((el) => el.name === 'Rodapé');
  assert.equal(rodape.onScreen, false, 'o que está fora da tela vem marcado');
  assert.ok(visto.elements.findIndex((el) => el.name === 'Rodapé') > visto.elements.findIndex((el) => el.name === 'Aceitar'), 'na tela primeiro');

  // Filtro por texto reduz a lista.
  const filtrado = await driver.observe('LINKEDIN', { query: 'kelvin' });
  assert.deepEqual(filtrado.elements.map((el) => el.name), ['Pessoa Alfa B.']);

  // Portões: senha recusada; ação sensível sem confirmação recusada; confirmada, acontece.
  await assert.rejects(driver.act('LINKEDIN', { type: 'type', ref: porNome('Senha')[0].ref, text: 'x' }), { code: 'password_field_forbidden' });
  const aceitarKelvin = porNome('Aceitar', 'button')[0].ref;
  await assert.rejects(driver.act('LINKEDIN', { type: 'click', ref: aceitarKelvin }), { code: 'confirmation_required' });
  const depois = await driver.act('LINKEDIN', { type: 'click', ref: aceitarKelvin, confirmed: true });
  assert.match(depois.text, /Convite de Pessoa Alfa aceito/);
  // Botão sem efeito externo clica direto.
  await driver.act('LINKEDIN', { type: 'click', ref: porNome('Ignorar', 'button')[0].ref });

  // Seleção, rolagem até um elemento, tecla.
  await driver.act('LINKEDIN', { type: 'select', ref: porNome('Ordenar', 'combobox')[0].ref, value: 'Antigos' });
  const rolado = await driver.act('LINKEDIN', { type: 'scroll', ref: rodape.ref });
  assert.ok(rolado.scroll.y > 500, 'rolou até o rodapé');
  await driver.act('LINKEDIN', { type: 'press', key: 'Home' });
  await assert.rejects(driver.act('LINKEDIN', { type: 'press', key: 'F12' }), { code: 'invalid_key' });

  // Digitar e enviar navega; a ref antiga deixa de valer; voltar recupera a página.
  const busca = await driver.act('LINKEDIN', { type: 'type', ref: porNome('Pesquisar', 'textbox')[0].ref, text: 'COBOL', submit: true });
  assert.match(busca.url, /\/busca\?q=COBOL$/);
  assert.match(busca.text, /Você buscou por COBOL/);
  await assert.rejects(driver.act('LINKEDIN', { type: 'click', ref: aceitarKelvin }), { code: 'browser_reference_ambiguous' });
  const voltou = await driver.act('LINKEDIN', { type: 'back' });
  assert.match(voltou.url, /\/convites$/);

  // Leitura longa de um perfil.
  await driver.act('LINKEDIN', { type: 'navigate', url: `${base}/in/kelvin` });
  const lido = await driver.readText('LINKEDIN', {});
  assert.match(lido.text, /Product Engineer/);

  // A regra de endereço público vale na fronteira com a IA.
  assert.throws(() => assertUrlPublica('http://127.0.0.1:4173/aba/LINKEDIN'), { code: 'invalid_browser_url' });
  assert.throws(() => assertUrlPublica('file:///C:/x'), { code: 'invalid_browser_url' });
  assert.throws(() => assertUrlPublica('http://192.168.0.10/'), { code: 'invalid_browser_url' });
  assert.equal(assertUrlPublica('https://www.linkedin.com/mynetwork/invitation-manager/'), 'https://www.linkedin.com/mynetwork/invitation-manager/');
});
