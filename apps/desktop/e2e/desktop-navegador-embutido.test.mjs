import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

// Desktop real, lançado como a pessoa lança (sem o Playwright dirigindo o
// Electron, para não disputar o CDP com o backend). O teste fala com a porta
// de depuração que o próprio app abre: é ela que o backend usa para embutir.
// Com o endpoint, abrir uma plataforma cria uma aba (alvo CDP) apontando para
// o quadro local, a interface lista a aba e a área reservada tem tamanho real.
const electronPath = createRequire(import.meta.url)('electron');

test('navegador embutido: a plataforma abre numa aba dentro da janela do Fluxo', {
  timeout: 150_000,
  skip: process.platform !== 'win32' && 'integração Electron oficial é validada no job Windows'
}, async (t) => {
  const quadro = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><title>Quadro local</title><h1>Quadro local</h1><p>${request.url}</p>`);
  });
  await new Promise((resolve) => quadro.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => quadro.close(resolve)));
  const quadroUrl = `http://127.0.0.1:${quadro.address().port}`;

  const userData = await mkdtemp(join(tmpdir(), 'fluxo-desktop-embutido-'));
  const rootDir = join(userData, 'workspace');
  await mkdir(rootDir, { recursive: true });
  await writeFile(join(rootDir, '.env'), `INFOJOBS_URL=${quadroUrl}/jobs\nPLAYWRIGHT_HEADLESS=true\nCODEX_COMMAND=${join(rootDir, 'codex-ausente.exe')}\n`, 'utf8');
  const env = { ...process.env, FLUXO_DESKTOP_USER_DATA: userData, FLUXO_DESKTOP_ROOT: rootDir };
  delete env.ELECTRON_RUN_AS_NODE;

  const electron = spawn(electronPath, [resolve('.')], { env, stdio: 'ignore', windowsHide: true });
  t.after(async () => { electron.kill(); await new Promise((resolve) => { electron.once('exit', resolve); setTimeout(resolve, 5000); }); });

  const porta = await esperar(async () => Number((await readFile(join(userData, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]) || null, 30_000, 'porta de depuração');
  const alvos = () => fetch(`http://127.0.0.1:${porta}/json`).then((r) => r.json());
  const janela = await esperar(async () => (await alvos()).find((alvo) => alvo.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+\/(\?|#|$)/.test(alvo.url)) ?? null, 60_000, 'janela do Fluxo com o backend');
  const eval_ = (expressao) => avaliar(janela.webSocketDebuggerUrl, expressao);
  await esperar(async () => (await eval_("Boolean(document.querySelector('#conteudo') && window.fluxoDesktop && document.querySelector('#conteudo').dataset.area)")) ? true : null, 60_000, 'interface pronta');

  const workspace = await eval_('window.fluxoDesktop.workspace()');
  assert.equal(workspace.embutido, true, 'o app lançado sozinho expõe a porta e embute o navegador');
  assert.equal((await eval_("document.querySelector('#conteudo').dataset.navegador")), 'embutido');

  const aberta = await eval_(`(async () => {
    const sessao = await (await fetch('/api/v1/auth/session')).json();
    const csrf = sessao.data?.csrfToken ?? sessao.csrfToken;
    const resposta = await fetch('/api/v1/browser/open', { method: 'POST', headers: { 'content-type': 'application/json', 'x-fluxo-csrf': csrf }, body: JSON.stringify({ platform: 'INFOJOBS' }) });
    return { status: resposta.status, corpo: await resposta.json(), abas: await (await fetch('/api/v1/browser/tabs')).json() };
  })()`);
  assert.equal(aberta.status, 200, JSON.stringify(aberta.corpo));
  assert.equal(aberta.abas.embedded, true);
  assert.equal(aberta.abas.tabs[0]?.platform, 'INFOJOBS');
  assert.ok(String(aberta.abas.tabs[0]?.url).startsWith(`${quadroUrl}/`), `a aba aponta para o quadro local: ${aberta.abas.tabs[0]?.url}`);

  // A aba é um alvo de página do Chromium do Electron: é isso que o driver opera.
  const abaCdp = (await alvos()).find((alvo) => alvo.type === 'page' && alvo.url.startsWith(`${quadroUrl}/`));
  assert.ok(abaCdp, 'a WebContentsView da plataforma aparece como alvo CDP');

  // A interface conhece a aba, mostra a faixa e, ao escolher, a aba fica visível na área reservada.
  await esperar(async () => (await eval_("[...document.querySelectorAll('.botao-aba')].some((b) => b.textContent === 'InfoJobs')")) ? true : null, 15_000, 'faixa de abas');
  await eval_("[...document.querySelectorAll('.botao-aba')].find((b) => b.textContent === 'InfoJobs').click()");
  const visiveis = await esperar(async () => { const lista = await eval_('window.fluxoDesktop.abas.listar()'); return lista.some((aba) => aba.visible) ? lista : null; }, 15_000, 'aba visível');
  assert.equal(visiveis.find((aba) => aba.visible).platform, 'INFOJOBS');
  const area = await eval_("(() => { const c = document.querySelector('#navegador-area').getBoundingClientRect(); return { width: c.width, height: c.height }; })()");
  assert.ok(area.width > 200 && area.height > 200, `a área reservada tem tamanho real: ${JSON.stringify(area)}`);

  // Achado real: fechar o app com uma aba aberta derrubava o processo principal
  // ("Object has been destroyed"). Fechar pelo próprio Chromium do app percorre
  // window close → before-quit → supervisor.stop; nada pode cair no caminho.
  const [, caminhoWs] = (await readFile(join(userData, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/);
  const saida = new Promise((resolve) => electron.once('exit', (codigo) => resolve(codigo)));
  await comandoCdp(`ws://127.0.0.1:${porta}${caminhoWs}`, 'Browser.close').catch(() => {});
  const codigo = await Promise.race([saida, new Promise((resolve) => setTimeout(() => resolve('demorou'), 20_000))]);
  assert.equal(codigo, 0, `o app encerra limpo ao fechar (código ${codigo})`);
  const log = await readFile(join(userData, 'logs', 'principal.log'), 'utf8').catch(() => '');
  assert.equal(log, '', `nenhum erro inesperado no processo principal:\n${log}`);
});

function comandoCdp(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const prazo = setTimeout(() => { socket.close(); reject(new Error('CDP sem resposta.')); }, 10_000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method, params })));
    socket.addEventListener('message', (evento) => { const m = JSON.parse(String(evento.data)); if (m.id === 1) { clearTimeout(prazo); socket.close(); resolve(m.result); } });
    socket.addEventListener('close', () => { clearTimeout(prazo); resolve(null); });
    socket.addEventListener('error', () => { clearTimeout(prazo); reject(new Error('CDP indisponível.')); });
  });
}

async function esperar(tentativa, prazoMs, descricao) {
  const inicio = Date.now();
  for (;;) {
    let valor = null;
    try { valor = await tentativa(); } catch { /* ainda não */ }
    if (valor !== null && valor !== undefined && valor !== false) return valor;
    if (Date.now() - inicio > prazoMs) throw new Error(`Tempo esgotado esperando: ${descricao}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

// Runtime.evaluate direto no alvo da janela, sem outro cliente Playwright no Electron.
function avaliar(wsUrl, expressao) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const prazo = setTimeout(() => { socket.close(); reject(new Error('CDP sem resposta.')); }, 20_000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expressao, awaitPromise: true, returnByValue: true } })));
    socket.addEventListener('message', (evento) => {
      const mensagem = JSON.parse(String(evento.data));
      if (mensagem.id !== 1) return;
      clearTimeout(prazo); socket.close();
      if (mensagem.error) return reject(new Error(mensagem.error.message));
      if (mensagem.result?.exceptionDetails) return reject(new Error(mensagem.result.exceptionDetails.exception?.description ?? 'exceção na página'));
      resolve(mensagem.result?.result?.value);
    });
    socket.addEventListener('error', () => { clearTimeout(prazo); reject(new Error('CDP indisponível.')); });
  });
}
