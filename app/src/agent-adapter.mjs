export function createAgentAdapter({ transport }) {
  let initialized = false;

  return {
    async initialize(clientInfo = { name: 'fluxo-harness', version: '0.1.0' }) {
      if (initialized) return { initialized: true };
      const result = await transport.request('initialize', { clientInfo });
      initialized = true;
      return result;
    },

    async startThread(params = {}) {
      await this.initialize();
      return transport.request('thread/start', params);
    },

    async runTurn(threadId, text) {
      await this.initialize();
      return transport.request('turn/start', {
        threadId,
        input: [{ type: 'text', text }]
      });
    }
  };
}
