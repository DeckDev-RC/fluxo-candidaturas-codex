import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlaywrightDriver } from '../app/src/playwright-driver.mjs';
import { assertUrlPublica } from '../app/src/browser-free.mjs';

// Navegador da IA em Chromium real, no método do Playwright MCP: snapshot de
// acessibilidade com refs, ações por ref ou por papel e nome, espera, captura.
// Os portões são verificados no navegador de verdade: senha recusada, ação sensível
// só confirmada, ref obsoleta rejeitada com saída por role+name.

const PAGINAS = {
  '/convites': `<main><h1>Convites</h1>
    <form action="/busca" method="get"><label for="q">Pesquisar</label><input id="q" name="q" type="text" placeholder="Buscar pessoas"></form>
    <ul>
      <li><a href="/in/kelvin">Pessoa Alfa</a> quer se conectar. <button type="button" onclick="this.closest('li').textContent='Convite de Pessoa Alfa aceito'">Aceitar</button></li>
      <li><a href="/in/ana">Pessoa Teste P.</a> quer se conectar. <button type="button">Aceitar</button> <button type="button" id="ignorar-ana" onclick="const n=this.cloneNode(true); n.textContent='Ignorado'; this.replaceWith(n)">Ignorar</button></li>
    </ul>
    <label>Ordenar <select id="ordem"><option>Recentes</option><option value="old">Antigos</option></select></label>
    <label for="senha">Senha</label><input id="senha" type="password">
    <button type="button" id="abrir-msg" onclick="setTimeout(() => { const d = document.createElement('div'); d.innerHTML = '<div role=\\'dialog\\' aria-label=\\'Nova mensagem\\'><div role=\\'textbox\\' contenteditable=\\'true\\' aria-label=\\'Escreva uma mensagem\\' style=\\'min-height:40px;border:1px solid #999\\'></div><button type=\\'button\\' onclick=\\'document.getElementById(&quot;enviadas&quot;).textContent = document.querySelector(&quot;[role=textbox]&quot;).innerText\\'>Enviar</button></div>'; document.body.append(d); }, 400)">Mensagem</button>
    <p id="enviadas"></p>
    <ul>${Array.from({ length: 30 }, (_, i) => `<li><a href="/in/pessoa-${i}">Pessoa ${i} da rede</a></li>`).join('')}</ul>
    <div style="height:2000px"></div><a href="/rodape" id="rodape">Rodapé</a></main>`,
  '/busca': '<main><h1>Resultados</h1><p>Você buscou por <span id="termo"></span>.</p><script>document.getElementById("termo").textContent=new URLSearchParams(location.search).get("q")</script></main>',
  '/in/kelvin': '<main><h1>Pessoa Alfa</h1><p>Product Engineer. I build interfaces and the reliability behind them.</p></main>'
};

test('navegador da IA: snapshot com refs, ações por ref e por role+name, espera, portões e captura', { timeout: 90_000 }, async (t) => {
  const servidor = createServer((request, response) => { const caminho = request.url.split('?')[0]; response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(`<!doctype html><title>Teste livre</title>${PAGINAS[caminho] ?? '<h1>Nada</h1>'}`); });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const driver = createPlaywrightDriver({ rootDir: await mkdtemp(join(tmpdir(), 'fluxo-livre-')), headless: true });
  t.after(async () => { await driver.close(); await new Promise((resolve) => servidor.close(resolve)); });

  // Snapshot hierárquico: refs, papéis, nomes e aninhamento (botão dentro do item da lista).
  await driver.act('LINKEDIN', { type: 'navigate', url: `${base}/convites` });
  const visto = await driver.observe('LINKEDIN', {});
  assert.equal(visto.title, 'Teste livre');
  assert.match(visto.snapshot, /heading "Convites" \[level=1\] \[ref=e\d+\]/);
  assert.match(visto.snapshot, /- listitem \[ref=e\d+\]:\n\s+- link "Pessoa Alfa B\." \[ref=e\d+\]/, 'a hierarquia diz a quem pertence cada botão');
  const refs = (nome) => [...visto.snapshot.matchAll(new RegExp(`button "${nome}" \\[ref=(e\\d+)\\]`, 'g'))].map((m) => m[1]);
  assert.equal(refs('Aceitar').length, 2, 'dois botões com o mesmo nome têm refs distintas');
  assert.notEqual(refs('Aceitar')[0], refs('Aceitar')[1]);
  assert.match(visto.snapshot, /combobox "Ordenar" \[ref=e\d+\]/);
  assert.equal(visto.truncated, false);

  // Filtro por texto mantém só o trecho relevante, com os ancestrais.
  const filtrado = await driver.observe('LINKEDIN', { query: 'kelvin' });
  assert.match(filtrado.snapshot, /Pessoa Alfa B\./);
  assert.doesNotMatch(filtrado.snapshot, /Pessoa Teste P\./);
  assert.match(filtrado.snapshot, /^- main/m, 'o caminho até o elemento é preservado');
  assert.equal(filtrado.filtered, true);
  // Limite de tamanho corta e avisa.
  const curto = await driver.observe('LINKEDIN', { maxChars: 1000 });
  assert.equal(curto.truncated, true, `chars=${curto.chars} len=${curto.snapshot.length} keys=${Object.keys(curto)}`);
  assert.match(curto.snapshot, /cortado; use query/);

  // Portões: senha recusada; ação sensível sem confirmação recusada; confirmada, acontece.
  const refSenha = visto.snapshot.match(/textbox "Senha" \[ref=(e\d+)\]/)[1];
  await assert.rejects(driver.act('LINKEDIN', { type: 'type', ref: refSenha, text: 'x' }), { code: 'password_field_forbidden' });
  const aceitarKelvin = refs('Aceitar')[0];
  await assert.rejects(driver.act('LINKEDIN', { type: 'click', ref: aceitarKelvin }), { code: 'confirmation_required' });
  const depois = await driver.act('LINKEDIN', { type: 'click', ref: aceitarKelvin, confirmed: true });
  assert.match(depois.snapshot, /Convite de Pessoa Alfa aceito/, 'a ação devolve o snapshot novo');

  // Re-render "React": o botão Ignorar é substituído; a ref antiga não resolve e role+name resolve.
  const refIgnorar = depois.snapshot.match(/button "Ignorar" \[ref=(e\d+)\]/)[1];
  await driver.act('LINKEDIN', { type: 'click', ref: refIgnorar });
  await assert.rejects(driver.act('LINKEDIN', { type: 'click', ref: refIgnorar }), { code: 'browser_reference_ambiguous' });
  // role+name ambíguo lista os candidatos em vez de escolher um.
  await assert.rejects(driver.act('LINKEDIN', { type: 'hover', role: 'link', name: 'Pessoa' }), (erro) => erro.code === 'browser_reference_ambiguous' && /30 elementos "link" casam/.test(erro.message));
  await assert.rejects(driver.act('LINKEDIN', { type: 'hover', role: 'button', name: 'Inexistente' }), (erro) => erro.code === 'browser_reference_ambiguous' && /Nenhum "button"/.test(erro.message));
  const porNome = await driver.act('LINKEDIN', { type: 'hover', role: 'button', name: 'Ignorado' });
  assert.match(porNome.snapshot, /button "Ignorado"/);

  // Seleção, rolagem até um elemento e tecla com modificador.
  const refOrdem = visto.snapshot.match(/combobox "Ordenar" \[ref=(e\d+)\]/)[1];
  await driver.act('LINKEDIN', { type: 'select', ref: refOrdem, value: 'Antigos' });
  await driver.act('LINKEDIN', { type: 'scroll', role: 'link', name: 'Rodapé' });
  await driver.act('LINKEDIN', { type: 'press', key: 'Control+Home' });
  await assert.rejects(driver.act('LINKEDIN', { type: 'press', key: 'F12' }), { code: 'invalid_key' });
  await assert.rejects(driver.act('LINKEDIN', { type: 'press', key: 'Alt+F4' }), { code: 'invalid_key' });

  // Painel que aparece com atraso: wait pelo texto, type em contenteditable, Enviar com confirmação.
  await driver.act('LINKEDIN', { type: 'click', role: 'button', name: 'Mensagem' });
  const painel = await driver.act('LINKEDIN', { type: 'wait', text: 'Escreva uma mensagem' });
  assert.match(painel.snapshot, /dialog "Nova mensagem"/);
  assert.match(painel.snapshot, /textbox "Escreva uma mensagem" \[ref=(e\d+)\]/);
  await driver.act('LINKEDIN', { type: 'type', role: 'textbox', name: 'Escreva uma mensagem', text: 'Olá, Pessoa Alfa! Obrigado pelo convite.' });
  await assert.rejects(driver.act('LINKEDIN', { type: 'click', role: 'button', name: 'Enviar' }), { code: 'confirmation_required' });
  const enviado = await driver.act('LINKEDIN', { type: 'click', role: 'button', name: 'Enviar', confirmed: true });
  assert.match(enviado.snapshot, /Olá, Pessoa Alfa! Obrigado pelo convite\./, 'a mensagem digitada no editor foi enviada');
  // Captura: PNG como data URL, sem gravar em disco.
  const foto = await driver.act('LINKEDIN', { type: 'screenshot' });
  assert.match(foto.imagem, /^data:image\/png;base64,[A-Za-z0-9+/=]{100,}/);
  assert.equal(foto.url.startsWith(base), true);
  const recorte = await driver.act('LINKEDIN', { type: 'screenshot', role: 'heading', name: 'Convites' });
  assert.ok(recorte.imagem.length < foto.imagem.length, 'o recorte de um elemento é menor que a tela');

  // Digitar e enviar navega; voltar recupera a página; leitura longa.
  const busca = await driver.act('LINKEDIN', { type: 'type', role: 'textbox', name: 'Pesquisar', text: 'COBOL', submit: true });
  assert.match(busca.url, /\/busca\?q=COBOL$/);
  assert.match(busca.snapshot, /Você buscou por COBOL/);
  const voltou = await driver.act('LINKEDIN', { type: 'back' });
  assert.match(voltou.url, /\/convites$/);
  await driver.act('LINKEDIN', { type: 'navigate', url: `${base}/in/kelvin` });
  assert.match((await driver.readText('LINKEDIN', {})).text, /Product Engineer/);

  // A regra de endereço público vale na fronteira com a IA.
  assert.throws(() => assertUrlPublica('http://127.0.0.1:4173/aba/LINKEDIN'), { code: 'invalid_browser_url' });
  assert.throws(() => assertUrlPublica('file:///C:/x'), { code: 'invalid_browser_url' });
  assert.equal(assertUrlPublica('https://www.linkedin.com/mynetwork/invitation-manager/'), 'https://www.linkedin.com/mynetwork/invitation-manager/');
});
