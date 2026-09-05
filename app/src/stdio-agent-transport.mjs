import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

export function createStdioAgentTransport({ command = 'codex', args = ['app-server', '--listen', 'stdio://'], cwd, env = process.env, authMode = 'chatgpt', onNotification = () => {} }) {
  const childEnv = { ...env };
  if (authMode === 'chatgpt') {
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN']) delete childEnv[key];
    if (cwd) {
      childEnv.CODEX_HOME = join(cwd, 'estado', 'codex-home');
      mkdirSync(childEnv.CODEX_HOME, { recursive: true });
    }
  }
  const child = spawn(command, args, { cwd, env: childEnv, shell: false, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const pending = new Map();
  const lines = createInterface({ input: child.stdout });
  let nextId = 1;
  let closed = false;

  lines.on('line', (line) => {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
      else request.resolve(message.result);
    } else if (message.method) {
      onNotification(message);
    }
  });

  child.on('error', (error) => rejectPending(error));
  child.on('close', (code) => {
    if (!closed) rejectPending(Object.assign(new Error(`Agente encerrou com código ${code}.`), { code: 'agent_closed' }));
  });

  return {
    request(method, params = {}) {
      if (closed) return Promise.reject(Object.assign(new Error('Transporte encerrado.'), { code: 'transport_closed' }));
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
      });
    },

    notify(method, params = {}) {
      if (closed) throw Object.assign(new Error('Transporte encerrado.'), { code: 'transport_closed' });
      child.stdin.write(`${JSON.stringify({ method, params })}\n`);
    },

    async close() {
      if (closed) return;
      closed = true;
      lines.close();
      rejectPending(Object.assign(new Error('Transporte encerrado.'), { code: 'transport_closed' }));
      child.kill();
    }
  };

  function rejectPending(error) {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }
}
