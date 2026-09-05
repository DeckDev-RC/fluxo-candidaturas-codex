export function createAgentAdapter({ transport, transportFactory, onNotification = () => {}, settingsService, domainTools } = {}) {
  let initialized = false;
  let activeTransport = transport;
  const threadRuns = new Map();
  const turnRuns = new Map();
  const pendingThreads = new Set();
  let initialization;

  async function getTransport() {
    if (!activeTransport && transportFactory) activeTransport = await transportFactory({ onNotification: handleNotification, onRequest: handleRequest });
    if (!activeTransport) throw Object.assign(new Error('Transporte do agente não configurado.'), { code: 'agent_transport_unavailable' });
    return activeTransport;
  }

  return {
    handleNotification,
    bindRun(runId, threadId, turnId = '') {
      if (threadId) threadRuns.set(String(threadId), String(runId));
      if (turnId) turnRuns.set(String(turnId), String(runId));
    },
    async initialize(clientInfo = { name: 'fluxo-harness', version: '0.1.0' }) {
      if (initialized) return { initialized: true };
      if (!initialization) initialization = (async () => {
        const active = await getTransport();
        const result = await active.request('initialize', { clientInfo, capabilities: { experimentalApi: true } });
        if (active.notify) active.notify('initialized', {});
        initialized = true;
        return result;
      })().catch(error => { initialization = null; throw error; });
      return initialization;
    },

    async startThread(params = {}) {
      await this.initialize();
      return (await getTransport()).request('thread/start', { ...params, ...(domainTools ? { dynamicTools: domainTools.definitions, sandbox: 'read-only', approvalPolicy: 'never', config: { 'features.shell_tool': false, 'features.unified_exec': false, 'features.apply_patch_freeform': false, 'web_search': 'disabled' }, developerInstructions: 'Use exclusivamente ferramentas fluxo_* para operar candidaturas. Nunca altere arquivos diretamente. Aprovação humana é obrigatória e não pode ser decidida pelo agente. Um turn concluído não significa uma candidatura enviada.' } : {}) });
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
      this.bindRun(runId, threadId);
      pendingThreads.add(threadId);
      try {
        const result = await this.runTurn(threadId, text, overrides);
        this.bindRun(runId, threadId, result?.turn?.id);
        return result;
      } finally { pendingThreads.delete(threadId); }
    },

    async close() {
      if (activeTransport?.close) await activeTransport.close();
    }
  };
  async function handleRequest(message) {
    if (message.method !== 'item/tool/call' || !domainTools) throw Object.assign(new Error('Solicitação do agente não permitida.'), { code: 'agent_request_denied' });
    const params = message.params ?? {};
    const runId = turnRuns.get(params.turnId) ?? threadRuns.get(params.threadId);
    if (!runId) throw Object.assign(new Error('Execução não associada.'), { code: 'tool_run_mismatch' });
    try { const result = await domainTools.call(params.tool, params.arguments, runId); return { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify(result) }] }; }
    catch (error) { return { success: false, contentItems: [{ type: 'inputText', text: JSON.stringify({ code: error.code ?? 'tool_failed', message: error.message }) }] }; }
  }

  function handleNotification(message) {
    const params = message.params ?? {};
    const threadId = params.threadId ?? params.thread?.id;
    const turnId = params.turnId ?? params.turn?.id;
    const pendingRun = pendingThreads.size === 1 ? threadRuns.get([...pendingThreads][0]) : '';
    const runId = turnRuns.get(turnId) ?? threadRuns.get(threadId) ?? pendingRun ?? '';
    if (runId && turnId) turnRuns.set(turnId, runId);
    onNotification(message, runId);
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
