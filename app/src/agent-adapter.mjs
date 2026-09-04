export function createAgentAdapter({ transport, transportFactory, onNotification = () => {} }) {
  let initialized = false;
  let activeTransport = transport;
  let activeRunId = '';

  async function getTransport() {
    if (!activeTransport && transportFactory) activeTransport = await transportFactory({ onNotification: handleNotification });
    if (!activeTransport) throw Object.assign(new Error('Transporte do agente não configurado.'), { code: 'agent_transport_unavailable' });
    return activeTransport;
  }

  return {
    handleNotification,
    async initialize(clientInfo = { name: 'fluxo-harness', version: '0.1.0' }) {
      if (initialized) return { initialized: true };
      const active = await getTransport();
      const result = await active.request('initialize', { clientInfo });
      if (active.notify) active.notify('initialized', {});
      initialized = true;
      return result;
    },

    async startThread(params = {}) {
      await this.initialize();
      return (await getTransport()).request('thread/start', params);
    },

    async runTurn(threadId, text) {
      await this.initialize();
      return (await getTransport()).request('turn/start', {
        threadId,
        input: [{ type: 'text', text }]
      });
    },

    async runTurnForRun(runId, threadId, text) {
      activeRunId = String(runId);
      try { return await this.runTurn(threadId, text); } finally { activeRunId = ''; }
    },

    async close() {
      if (activeTransport?.close) await activeTransport.close();
    }
  };

  function handleNotification(message) {
    onNotification(message, activeRunId);
  }
}
