import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

export function createStdioAgentTransport({ command = 'codex', shell = false, args = ['app-server', '--listen', 'stdio://'], cwd, env = process.env, authMode = 'chatgpt', onNotification = () => {}, onRequest, timeoutMs = 60_000 }) {
  const childEnv = { ...env };
  if (authMode === 'chatgpt') {
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN']) delete childEnv[key];
    if (cwd) {
      childEnv.CODEX_HOME = join(cwd, 'estado', 'codex-home');
      mkdirSync(childEnv.CODEX_HOME, { recursive: true });
    }
  }
  const child = spawn(command, args, { cwd, env: childEnv, shell, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const pending = new Map();
  const lines = createInterface({ input: child.stdout });
  let nextId = 1;
  let closed = false;
  // Executável ausente é a falha mais comum: ela chega pelo evento 'error' e,
  // sem esta marca, cada pedido seguinte esperaria o timeout inteiro.
  let spawnFailure = null;
  child.stdin.on('error', () => {});

  lines.on('line', (line) => {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined && message.method) {
      Promise.resolve().then(() => {
        if (!onRequest) throw new Error('Solicitação não autorizada.');
        return onRequest(message);
      }).then(result => child.stdin.write(`${JSON.stringify({ id: message.id, result })}\n`), () => child.stdin.write(`${JSON.stringify({ id: message.id, error: { code: -32601, message: 'Solicitação não autorizada pelo Fluxo.' } })}\n`));
    } else if (message.id !== undefined && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
      else request.resolve(message.result);
    } else if (message.method) {
      onNotification(message);
    }
  });

  child.on('error', (error) => {
    spawnFailure = error?.code === 'ENOENT'
      ? Object.assign(new Error(`O Codex não foi encontrado (comando: ${command}).`), { code: 'agent_unavailable', cause: error })
      : Object.assign(new Error(`Não foi possível iniciar o Codex: ${error?.message ?? error}`), { code: 'agent_unavailable', cause: error });
    rejectPending(spawnFailure);
  });
  child.on('close', (code) => {
    if (closed) return;
    spawnFailure ??= Object.assign(new Error(`Agente encerrou com código ${code}.`), { code: 'agent_closed' });
    rejectPending(spawnFailure);
  });

  return {
    request(method, params = {}) {
      if (closed) return Promise.reject(Object.assign(new Error('Transporte encerrado.'), { code: 'transport_closed' }));
      if (spawnFailure) return Promise.reject(spawnFailure);
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(Object.assign(new Error('O App Server não respondeu no prazo.'), { code: 'agent_timeout' })); }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
      });
    },

    notify(method, params = {}) {
      if (closed) throw Object.assign(new Error('Transporte encerrado.'), { code: 'transport_closed' });
      child.stdin.write(`${JSON.stringify({ method, params })}\n`);
    },

    // Encerra e espera o processo sair de fato: quem chama pode apagar a pasta de
    // trabalho em seguida, e um Codex ainda vivo a manteria ocupada.
    async close() {
      if (closed) return;
      closed = true;
      lines.close();
      rejectPending(Object.assign(new Error('Transporte encerrado.'), { code: 'transport_closed' }));
      // Sem pid o processo nunca subiu; com exitCode ele já saiu.
      if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
      await new Promise((resolve) => {
        const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2_000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        child.kill();
      });
    }
  };

  function rejectPending(error) {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
  }
}
