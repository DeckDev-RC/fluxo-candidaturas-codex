export function createSupervisor({ launch, timeoutMs = 20_000, onExit = () => {} }) {
  let child; let ready; let starting; let stopping = false;
  return {
    async start() {
      if (ready) return ready;
      if (starting) return starting;
      stopping = false;
      starting = new Promise((resolve, reject) => {
        child = launch();
        const timer = setTimeout(() => { child?.kill(); reject(failure('O serviço local demorou para iniciar.')); }, timeoutMs);
        child.on('message', message => {
          if (message.type === 'ready') { clearTimeout(timer); ready = message; resolve(message); }
          if (message.type === 'failed') { clearTimeout(timer); reject(failure(message.message || 'Falha ao iniciar o serviço local.')); }
        });
        child.once('error', () => { clearTimeout(timer); reject(failure('Não foi possível criar o serviço local.')); });
        child.once('exit', code => {
          clearTimeout(timer); const wasReady = Boolean(ready); ready = null; child = null; starting = null;
          if (!wasReady) reject(failure('O serviço local encerrou durante a inicialização.'));
          if (!stopping) onExit(code);
        });
      });
      try { return await starting; } catch (error) { starting = null; throw error; }
    },
    async stop() {
      stopping = true;
      const active = child;
      if (!active) return;
      await new Promise(resolve => {
        const timer = setTimeout(() => { active.kill(); resolve(); }, 5000);
        active.once('exit', () => { clearTimeout(timer); resolve(); });
        active.postMessage({ type: 'shutdown' });
      });
      child = null; ready = null; starting = null;
    }
  };
}

function failure(message) { return Object.assign(new Error(message), { code: 'backend_start_failed' }); }
