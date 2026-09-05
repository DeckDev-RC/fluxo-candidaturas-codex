export function createAgentAdapter({ transport, transportFactory, onNotification = () => {}, settingsService } = {}) {
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

    async request(method, params) {
      await this.initialize();
      return (await getTransport()).request(method, params);
    },

    async runTurn(threadId, text, overrides = {}) {
      await this.initialize();
      let settings = {};
      try { settings = settingsService?.get ? await settingsService.get() : {}; } catch { settings = {}; }
      return (await getTransport()).request('turn/start', {
        threadId,
        input: [{ type: 'text', text }],
        ...turnSettings({ ...settings, ...overrides })
      });
    },

    async runTurnForRun(runId, threadId, text, overrides = {}) {
      activeRunId = String(runId);
      try { return await this.runTurn(threadId, text, overrides); } finally { activeRunId = ''; }
    },

    async close() {
      if (activeTransport?.close) await activeTransport.close();
    }
  };

  function handleNotification(message) {
    onNotification(message, activeRunId);
  }
}

function turnSettings(settings = {}) {
  const value = {};
  if (String(settings.model ?? '').trim()) value.model = String(settings.model).trim();
  if (String(settings.effort ?? '').trim()) value.effort = String(settings.effort).trim();
  const summary = String(settings.summary ?? settings.reasoningSummary ?? '').trim();
  if (summary && summary !== 'auto') value.summary = summary;
  return value;
}
