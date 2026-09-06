import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStdioAgentTransport } from '../src/stdio-agent-transport.mjs';
import { createAgentAdapter } from '../src/agent-adapter.mjs';
import { createServer } from '../src/http-server.mjs';
import { abrirFluxo } from '../src/routes/http-helpers.mjs';
import { acquireFluxoLock } from '../src/lock.mjs';

// Invariantes de ciclo de vida do serviço local (auditoria de 06/09/2026):
// o processo nunca cai por rota, notificação ou fluxo SSE; um Codex morto é
// percebido na hora e substituído; a trava espera a operação do próprio processo.

test('o Codex sair é percebido na hora, o adaptador descarta o transporte e o próximo pedido cria outro', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-transporte-morre-'));
  const agente = join(root, 'agente.mjs');
  // Responde ao initialize e sai logo depois do primeiro turn/start, como um crash.
  await writeFile(agente, `
    process.stdin.setEncoding('utf8'); let buffer = '';
    process.stdin.on('data', (chunk) => {
      buffer += chunk; const linhas = buffer.split('\\n'); buffer = linhas.pop();
      for (const linha of linhas.filter(Boolean)) {
        const m = JSON.parse(linha);
        if (m.method === 'initialize') process.stdout.write(JSON.stringify({ id: m.id, result: { ok: true } }) + '\\n');
        else if (m.method === 'thread/start') process.stdout.write(JSON.stringify({ id: m.id, result: { thread: { id: 't1' } } }) + '\\n');
        else if (m.method === 'turn/start') process.exit(3);
        else if (m.id !== undefined) process.stdout.write(JSON.stringify({ id: m.id, result: {} }) + '\\n');
      }
    });
  `);
  const fechamentos = [];
  const notificacoes = [];
  let criados = 0;
  const adapter = createAgentAdapter({
    transportFactory: ({ onNotification, onRequest, onClose }) => { criados += 1; return createStdioAgentTransport({ command: process.execPath, args: [agente], onNotification, onRequest, onClose: (erro) => { fechamentos.push(erro.code); onClose(erro); }, timeoutMs: 5_000 }); },
    onNotification: (mensagem) => notificacoes.push(mensagem.method)
  });
  try {
    const thread = await adapter.startThread({ conversation: true });
    assert.equal(thread.thread.id, 't1');
    await assert.rejects(adapter.request('turn/start', { threadId: 't1', input: [] }), { code: 'agent_closed' });
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(fechamentos, ['agent_closed'], 'o transporte avisa que o processo saiu');
    assert.ok(notificacoes.includes('transport/closed'), 'quem escuta (conversa, saúde) recebe o aviso');
    // Próximo pedido: transporte novo, sem esperar timeout algum.
    const inicio = Date.now();
    const outra = await adapter.startThread({ conversation: true });
    assert.equal(outra.thread.id, 't1');
    assert.equal(criados, 2, 'um transporte novo foi criado');
    assert.ok(Date.now() - inicio < 4_000, 'sem esperar o prazo do pedido anterior');
  } finally { await adapter.close(); }
});

test('rota que lança fora do envelope responde 500 em JSON e o servidor segue atendendo', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-rota-lanca-'));
  // O serviço de preflight lança de forma síncrona: antes, virava rejeição solta e derrubava o processo.
  const server = createServer({ rootDir: root, requireSession: false, preflightService: { runPreflight() { throw new Error('disco travado'); } } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let rejeicoesSoltas = 0;
  const ouvinte = () => { rejeicoesSoltas += 1; };
  process.on('unhandledRejection', ouvinte);
  try {
    const resposta = await fetch(`${base}/api/v1/preflight/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const corpo = await resposta.json();
    assert.ok([500, 409, 400].includes(resposta.status), `erro em JSON, não queda: ${resposta.status}`);
    assert.ok(corpo.error?.code, JSON.stringify(corpo));
    assert.equal((await fetch(`${base}/health`)).status, 200, 'o servidor continua vivo');
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(rejeicoesSoltas, 0);
  } finally { process.off('unhandledRejection', ouvinte); await new Promise((resolve) => server.close(resolve)); }
});

test('escrever num fluxo SSE depois do fim não lança, e o encerramento limpa assinaturas e batimento', async () => {
  const { createServer: criarHttp } = await import('node:http');
  let fluxo;
  let cancelamentos = 0;
  const servidor = criarHttp((request, response) => {
    fluxo = abrirFluxo(request, response, { batimentoMs: 20 });
    fluxo.aoEncerrar(() => { cancelamentos += 1; });
    fluxo.evento('ola', { a: 1 }, '1');
  });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  try {
    const controle = new AbortController();
    const resposta = await fetch(`http://127.0.0.1:${servidor.address().port}/`, { signal: controle.signal });
    const leitor = resposta.body.getReader();
    const primeiro = new TextDecoder().decode((await leitor.read()).value);
    assert.match(primeiro, /: conectado/);
    // Encerramento do servidor: end() antes do socket fechar, como closeAllConnections faz.
    await new Promise((r) => setTimeout(r, 30));
    fluxo.encerrar();
    assert.doesNotThrow(() => { fluxo.evento('tarde', { b: 2 }, '2'); });
    assert.equal(fluxo.evento('tarde', { b: 2 }, '3'), false, 'escrita depois do fim é ignorada');
    assert.equal(cancelamentos, 1, 'assinatura cancelada uma vez');
    controle.abort();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(cancelamentos, 1, 'fechar o cliente depois não cancela de novo');
  } finally { await new Promise((resolve) => servidor.close(resolve)); }
});

test('a trava espera a operação do próprio processo terminar em vez de falhar na hora', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-trava-espera-'));
  const soltar = await acquireFluxoLock(root);
  setTimeout(() => { void soltar(); }, 200);
  const inicio = Date.now();
  const segunda = await acquireFluxoLock(root);
  assert.ok(Date.now() - inicio >= 150, 'esperou a primeira soltar');
  await segunda();
  // Sem soltar dentro do prazo, ainda falha com código próprio (com mensagem do próprio processo).
  const terceira = await acquireFluxoLock(root);
  await assert.rejects(acquireFluxoLock(root, { waitMs: 150 }), (erro) => erro.code === 'fluxo_locked' && erro.ownPid === true);
  await terceira();
});
