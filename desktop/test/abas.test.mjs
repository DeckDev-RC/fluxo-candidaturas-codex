import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createAbas } = require('../abas.cjs');

// WebContentsView falsa: registra limites, visibilidade e carregamentos.
function viewFalsa() {
  const ouvintes = {};
  const view = {
    bounds: null, visible: null,
    setBounds(b) { view.bounds = b; },
    setVisible(v) { view.visible = v; },
    webContents: {
      carregadas: [], titulo: '', url: '',
      async loadURL(url) { view.webContents.carregadas.push(url); view.webContents.url = url; ouvintes['did-stop-loading']?.(); },
      getTitle: () => view.webContents.titulo,
      getURL: () => view.webContents.url,
      on(evento, fn) { ouvintes[evento] = fn; },
      setWindowOpenHandler(fn) { view.webContents.popup = fn; },
      session: { setPermissionRequestHandler(fn) { view.webContents.permissao = fn; } },
      close() { view.webContents.fechada = true; },
      recarregadas: 0, reload() { view.webContents.recarregadas += 1; },
      navigationHistory: { voltou: 0, canGoBack: () => view.webContents.url.includes('/jobs/'), goBack() { view.webContents.navigationHistory.voltou += 1; } }
    }
  };
  return view;
}

test('controles manuais: voltar só quando há histórico, recarregar e URL atual só http(s)', async () => {
  const views = [];
  const abas = createAbas({ window: janelaFalsa(), criarView: () => { const v = viewFalsa(); views.push(v); return v; } });
  await abas.abrir('LINKEDIN', 'http://127.0.0.1:4173/aba/LINKEDIN');
  assert.equal(abas.voltar('LINKEDIN'), false, 'na marcadora não há para onde voltar');
  assert.equal(abas.urlAtual('LINKEDIN'), 'http://127.0.0.1:4173/aba/LINKEDIN');
  await abas.abrir('LINKEDIN', 'https://www.linkedin.com/jobs/');
  assert.equal(abas.voltar('linkedin'), true);
  assert.equal(views[0].webContents.navigationHistory.voltou, 1);
  assert.equal(abas.recarregar('LINKEDIN'), true);
  assert.equal(views[0].webContents.recarregadas, 1);
  assert.equal(abas.recarregar('GUPY'), false, 'aba inexistente não lança');
  views[0].webContents.url = 'about:blank';
  assert.equal(abas.urlAtual('LINKEDIN'), '', 'só http(s) vai para o navegador do sistema');
});

function janelaFalsa() {
  const filhos = [];
  return { filhos, contentView: { addChildView: (v) => filhos.push(v), removeChildView: (v) => { const i = filhos.indexOf(v); if (i >= 0) filhos.splice(i, 1); } } };
}

test('uma aba por plataforma, só a visível ocupa a área e a interface é avisada', async () => {
  const janela = janelaFalsa();
  const views = [];
  const avisos = [];
  const abas = createAbas({ window: janela, criarView: () => { const v = viewFalsa(); views.push(v); return v; }, aoMudar: (lista) => avisos.push(lista) });

  await abas.abrir('linkedin', 'http://127.0.0.1:4173/aba/LINKEDIN');
  await abas.abrir('LINKEDIN', 'https://www.linkedin.com/jobs/');
  await abas.abrir('GUPY', 'http://127.0.0.1:4173/aba/GUPY');
  assert.equal(views.length, 2, 'reabrir a mesma plataforma reaproveita a view');
  assert.deepEqual(views[0].webContents.carregadas, ['http://127.0.0.1:4173/aba/LINKEDIN', 'https://www.linkedin.com/jobs/']);
  assert.equal(janela.filhos.length, 2);

  // Sem área definida nada aparece, mesmo com aba escolhida.
  abas.mostrar('LINKEDIN');
  assert.equal(views[0].visible, false);
  abas.definirArea({ x: 700, y: 120, width: 520.4, height: 640.6 });
  assert.equal(views[0].visible, true);
  assert.deepEqual(views[0].bounds, { x: 700, y: 120, width: 520, height: 641 });
  assert.equal(views[1].visible, false);
  assert.deepEqual(views[1].bounds, { x: 0, y: 0, width: 0, height: 0 });
  assert.equal(janela.filhos.at(-1), views[0], 'a aba mostrada vai para a frente');

  abas.mostrar('GUPY');
  assert.equal(views[0].visible, false);
  assert.equal(views[1].visible, true);
  abas.definirArea(null);
  assert.equal(views[1].visible, false, 'área nula esconde (rota diferente, diálogo, fora da vista)');

  const lista = abas.listar();
  assert.deepEqual(lista.map((a) => [a.platform, a.visible]), [['LINKEDIN', false], ['GUPY', true]]);
  assert.equal(lista[0].url, 'https://www.linkedin.com/jobs/');
  // Avisos são agrupados (rajadas de carregamento) e só saem quando o retrato mudou.
  await new Promise((r) => setTimeout(r, 120));
  const antes = avisos.length;
  assert.ok(antes >= 1 && antes <= 4, `avisos agrupados: ${antes}`);
  assert.deepEqual(avisos.at(-1).map((a) => [a.platform, a.visible]), [['LINKEDIN', false], ['GUPY', true]]);
  abas.mostrar('GUPY');
  abas.definirArea(null);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(avisos.length, antes, 'repetir o mesmo estado não avisa de novo');
  // Mostrar a aba já visível não reordena (reordenar faz a aba piscar).
  const ordemAntes = [...janela.filhos];
  abas.mostrar('GUPY');
  assert.deepEqual(janela.filhos, ordemAntes);

  // Endurecimento: popup abre na própria aba e permissões são negadas.
  assert.deepEqual(views[0].webContents.popup({ url: 'https://www.linkedin.com/x' }), { action: 'deny' });
  assert.equal(views[0].webContents.carregadas.at(-1), 'https://www.linkedin.com/x');
  let permitido = null; views[0].webContents.permissao(null, 'camera', (v) => { permitido = v; });
  assert.equal(permitido, false);

  abas.fecharTodas();
  assert.equal(janela.filhos.length, 0);
  assert.equal(views[0].webContents.fechada, true);
  assert.deepEqual(abas.listar(), []);
});

// Achado real: ao fechar o app, `fecharTodas` tocava na janela já destruída e o
// processo principal caía com "Object has been destroyed".
test('fechar com a janela ou a view destruída não lança; depois de destruir, nada mais avisa', async () => {
  const janela = janelaFalsa();
  janela.isDestroyed = () => false;
  const avisos = [];
  const views = [];
  const abas = createAbas({ window: janela, criarView: () => { const v = viewFalsa(); views.push(v); return v; }, aoMudar: (lista) => avisos.push(lista) });
  await abas.abrir('GUPY', 'http://127.0.0.1:1/aba/GUPY');
  await abas.abrir('LINKEDIN', 'http://127.0.0.1:1/aba/LINKEDIN');
  // A janela morre antes do encerramento chamar fecharTodas.
  janela.isDestroyed = () => true;
  janela.contentView.removeChildView = () => { throw new TypeError('Object has been destroyed'); };
  views[0].webContents.isDestroyed = () => true;
  views[0].webContents.close = () => { throw new TypeError('Object has been destroyed'); };
  assert.doesNotThrow(() => abas.destruir());
  assert.deepEqual(abas.listar(), []);
  assert.equal(views[1].webContents.fechada, true, 'a view viva ainda é fechada');
  await new Promise((r) => setTimeout(r, 120));
  const depois = avisos.length;
  abas.definirArea({ x: 0, y: 0, width: 100, height: 100 });
  await assert.rejects(abas.abrir('GUPY', 'http://127.0.0.1:1/aba/GUPY'), /não está disponível/);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(avisos.length, depois, 'nada é avisado depois de destruir');
});

test('a área vinda do renderer é saneada: NaN, negativos e valores absurdos escondem a aba', async () => {
  const janela = janelaFalsa();
  const view = viewFalsa();
  const abas = createAbas({ window: janela, criarView: () => view });
  await abas.abrir('GUPY', 'http://127.0.0.1:1/aba/GUPY');
  abas.mostrar('GUPY');
  for (const ruim of [{ x: NaN, y: 0, width: 100, height: 100 }, { x: -5, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 1e9, height: 100 }, 'texto', 42, null]) {
    abas.definirArea(ruim);
    assert.equal(view.visible, false, `área inválida esconde: ${JSON.stringify(ruim)}`);
  }
  abas.definirArea({ x: '10.4', y: 20, width: 300, height: 200 });
  assert.deepEqual(view.bounds, { x: 10, y: 20, width: 300, height: 200 });
});

test('mostrar plataforma inexistente devolve falso e abrir sem plataforma falha', async () => {
  const abas = createAbas({ window: janelaFalsa(), criarView: viewFalsa });
  assert.equal(abas.mostrar('CATHO'), false);
  await assert.rejects(abas.abrir('', 'http://x'), /Plataforma obrigatória/);
});
