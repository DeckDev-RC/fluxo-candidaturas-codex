// Supervisiona o processo do serviço local. Cada filho é identificado: eventos
// de um processo antigo (saída tardia após kill por timeout) nunca alteram o
// estado do processo novo, e `stop()` só resolve quando o filho saiu de fato.
export function createSupervisor({ launch, timeoutMs = 20_000, killTimeoutMs = 5_000, onExit = () => {} }) {
  let child; let ready; let starting; let stopping = false;
  return {
    async start() {
      if (ready) return ready;
      if (starting) return starting;
      stopping = false;
      starting = new Promise((resolve, reject) => {
        const este = launch();
        child = este;
        const timer = setTimeout(() => { este?.kill(); reject(failure('O serviço local demorou para iniciar.')); }, timeoutMs);
        este.on('message', message => {
          if (child !== este) return;
          if (message.type === 'ready') { clearTimeout(timer); ready = message; resolve(message); }
          if (message.type === 'failed') { clearTimeout(timer); reject(failure(message.message || 'Falha ao iniciar o serviço local.', message.detail)); }
        });
        // 'error' pode chegar depois de pronto (falha do próprio utility process): sem ouvinte, derruba o principal.
        este.on('error', (error) => { clearTimeout(timer); if (child === este) reject(failure('Não foi possível criar o serviço local.', error?.message)); });
        este.once('exit', code => {
          clearTimeout(timer);
          if (child !== este) return;
          const wasReady = Boolean(ready); ready = null; child = null; starting = null;
          if (!wasReady) reject(failure('O serviço local encerrou durante a inicialização.', `código ${code}`));
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
        let encerrado = false;
        const concluir = () => { if (!encerrado) { encerrado = true; resolve(); } };
        // Pede o encerramento; sem resposta, mata e ainda espera o processo sair.
        const timer = setTimeout(() => {
          active.kill();
          setTimeout(concluir, Math.min(killTimeoutMs, 2_000));
        }, killTimeoutMs);
        active.once('exit', () => { clearTimeout(timer); concluir(); });
        try { active.postMessage({ type: 'shutdown' }); } catch { active.kill(); }
      });
      if (child === active) { child = null; ready = null; starting = null; }
    }
  };
}

function failure(message, detail = '') { return Object.assign(new Error(message), { code: 'backend_start_failed', detail }); }
