import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCodexCommand } from '../src/codex-command.mjs';
import { createStdioAgentTransport } from '../src/stdio-agent-transport.mjs';
import { createRuntimeHealth, CODEX_MISSING_GUIDANCE } from '../src/runtime-health.mjs';
import { acquireFluxoLock } from '../src/lock.mjs';

// Achados do primeiro teste de usabilidade (2026-09-05): o Codex existia na máquina
// (app desktop da OpenAI e extensão do editor), mas não no PATH; o clique em
// "Entrar com ChatGPT" esperou 60 s segurando a trava e o segundo clique recebeu
// "Outra execução do Fluxo já está usando esta raiz".

test('o Codex é localizado no app desktop da OpenAI e na extensão do editor quando não está no PATH', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fluxo-codex-'));
  const local = join(home, 'AppData', 'Local');
  const env = { PATH: join(home, 'vazio'), LOCALAPPDATA: local, APPDATA: join(home, 'AppData', 'Roaming') };

  assert.equal(resolveCodexCommand({ env, platform: 'win32', home }).found, false);

  const extensao = join(home, '.cursor', 'extensions', 'openai.chatgpt-26.1-win32-x64', 'bin', 'windows-x86_64');
  await mkdir(extensao, { recursive: true });
  await writeFile(join(extensao, 'codex.exe'), '');
  const daExtensao = resolveCodexCommand({ env, platform: 'win32', home });
  assert.equal(daExtensao.found, true);
  assert.equal(daExtensao.path, join(extensao, 'codex.exe'));
  assert.equal(daExtensao.source, 'instalação conhecida');

  // O app desktop tem prioridade sobre a extensão e a versão mais recente vence.
  const antiga = join(local, 'OpenAI', 'Codex', 'bin', 'aaaa');
  const nova = join(local, 'OpenAI', 'Codex', 'bin', 'bbbb');
  await mkdir(antiga, { recursive: true });
  await writeFile(join(antiga, 'codex.exe'), '');
  await new Promise((resolve) => setTimeout(resolve, 20));
  await mkdir(nova, { recursive: true });
  await writeFile(join(nova, 'codex.exe'), '');
  assert.equal(resolveCodexCommand({ env, platform: 'win32', home }).path, join(nova, 'codex.exe'));

  // No PATH, o PATH vence; atalho .cmd exige shell.
  const bin = join(home, 'bin');
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, 'codex.cmd'), '');
  const doPath = resolveCodexCommand({ env: { ...env, PATH: bin }, platform: 'win32', home });
  assert.equal(doPath.source, 'PATH');
  assert.equal(doPath.shell, true);

  // CODEX_COMMAND configurado vence tudo, mas caminho inexistente é erro explícito.
  assert.equal(resolveCodexCommand({ configured: join(home, 'nao-existe', 'codex.exe'), env, platform: 'win32', home }).found, false);
  assert.match(resolveCodexCommand({ configured: join(home, 'nao-existe', 'codex.exe'), env, platform: 'win32', home }).reason, /CODEX_COMMAND/);
  assert.equal(resolveCodexCommand({ configured: 'codex', env, platform: 'win32', home }).command, 'codex');
});

test('executável ausente falha em milissegundos, não no timeout, e rejeita pedidos posteriores', async () => {
  const transport = createStdioAgentTransport({ command: 'fluxo-codex-inexistente-xyz', cwd: await mkdtemp(join(tmpdir(), 'fluxo-transport-')), timeoutMs: 60_000 });
  const inicio = Date.now();
  await assert.rejects(transport.request('initialize', {}), (error) => {
    assert.equal(error.code, 'agent_unavailable');
    assert.match(error.message, /não foi encontrado/);
    return true;
  });
  assert.ok(Date.now() - inicio < 5_000, 'a falha de spawn não pode esperar o timeout do App Server');
  await assert.rejects(transport.request('account/read', {}), { code: 'agent_unavailable' });
  await transport.close();
});

test('a saúde do runtime explica quando o Codex não foi encontrado e diz o que fazer', async () => {
  const semCodex = createRuntimeHealth({ authService: { status: async () => ({ status: 'authenticated' }) }, codex: () => ({ found: false, reason: 'O Codex não foi encontrado neste computador.', source: null }) });
  const saude = await semCodex.snapshot();
  assert.equal(saude.state, 'unavailable');
  assert.equal(saude.reason, 'codex_not_found');
  assert.equal(saude.codex.found, false);
  assert.ok(saude.message.includes(CODEX_MISSING_GUIDANCE));

  const comCodex = createRuntimeHealth({ authService: { status: async () => ({ status: 'authenticated' }) }, codex: () => ({ found: true, path: 'C:/codex.exe', source: 'PATH' }) });
  const conectada = await comCodex.snapshot();
  assert.equal(conectada.state, 'signed_in');
  assert.deepEqual(conectada.codex, { found: true, path: 'C:/codex.exe', source: 'PATH' });
});

test('trava ocupada pelo próprio processo explica que há outra operação em andamento', async () => {
  const raiz = await mkdtemp(join(tmpdir(), 'fluxo-lock-'));
  const liberar = await acquireFluxoLock(raiz);
  await assert.rejects(acquireFluxoLock(raiz), (error) => {
    assert.equal(error.code, 'fluxo_locked');
    assert.match(error.message, /outra operação/i);
    assert.doesNotMatch(error.message, /Outra execução/);
    return true;
  });
  await liberar();
  // Dono morto ainda é recuperado; dono de outro processo vivo mantém a mensagem antiga.
  await writeFile(join(raiz, 'estado', 'harness.lock'), JSON.stringify({ pid: 999_999_9, acquiredAt: new Date().toISOString() }));
  const recuperado = await acquireFluxoLock(raiz);
  await recuperado();
});
