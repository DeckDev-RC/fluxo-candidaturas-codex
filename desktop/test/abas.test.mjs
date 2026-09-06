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
      close() { view.webContents.fechada = true; }
    }
  };
  return view;
}

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

test('mostrar plataforma inexistente devolve falso e abrir sem plataforma falha', async () => {
  const abas = createAbas({ window: janelaFalsa(), criarView: viewFalsa });
  assert.equal(abas.mostrar('CATHO'), false);
  await assert.rejects(abas.abrir('', 'http://x'), /Plataforma obrigatória/);
});
