// Toda thread nasce com sandbox só leitura, sem aprovação automática, sem shell,
// sem patch e sem web. A de operação recebe as ferramentas fluxo_*; a de
// conversa (`conversation`) não recebe ferramenta nenhuma.
function parametrosDeThread(params, domainTools) {
  const { conversation = false, ...resto } = params;
  const restricoes = { sandbox: 'read-only', approvalPolicy: 'never', config: { 'features.shell_tool': false, 'features.unified_exec': false, 'features.apply_patch_freeform': false, 'web_search': 'disabled' } };
  // Instruções próprias (ex.: agente condutor) prevalecem sobre a frase padrão de operação.
  const operacao = domainTools && !conversation
    ? { dynamicTools: domainTools.definitions, developerInstructions: resto.developerInstructions ?? 'Use exclusivamente ferramentas fluxo_* para operar candidaturas. Nunca altere arquivos diretamente. Aprovação humana é obrigatória e não pode ser decidida pelo agente. Um turn concluído não significa uma candidatura enviada.' }
    : {};
  return { ...resto, ...restricoes, ...operacao };
}

export function createAgentAdapter({ transport, transportFactory, onNotification = () => {}, onToolCall = () => {}, settingsService, domainTools } = {}) {
  let initialized = false;
  let activeTransport = transport;
  const threadRuns = new Map();
  const turnRuns = new Map();
  const pendingThreads = new Set();
  let initialization;

  async function getTransport() {
    if (!activeTransport && transportFactory) {
      const criado = await transportFactory({ onNotification: handleNotification, onRequest: handleRequest, onClose: (erro) => descartarTransporte(criado, erro) });
      activeTransport = criado;
    }
    if (!activeTransport) throw Object.assign(new Error('Transporte do agente não configurado.'), { code: 'agent_transport_unavailable' });
    return activeTransport;
  }

  // O processo do Codex morreu: o transporte sai do cache na hora, a próxima
  // chamada cria outro, e quem escuta recebe um aviso para encerrar o que
  // estava em curso (turno da conversa, saúde da IA).
  function descartarTransporte(morto, erro) {
    if (activeTransport !== morto) return;
    activeTransport = null;
    initialized = false;
    initialization = null;
    handleNotification({ method: 'transport/closed', params: { code: erro?.code ?? 'agent_closed', message: erro?.message ?? 'O Codex encerrou.' } });
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
      })().catch(error => {
        initialization = null;
        // Um processo que nem subiu não pode ficar em cache: a próxima tentativa
        // (por exemplo, depois de instalar o Codex) precisa criar um transporte novo.
        if (transportFactory && ['agent_unavailable', 'agent_closed', 'transport_closed'].includes(error?.code)) {
          const dead = activeTransport;
          activeTransport = null;
          Promise.resolve(dead?.close?.()).catch(() => {});
        }
        throw error;
      });
      return initialization;
    },

    // Toda thread nasce sem shell, sem edição de arquivos e sem busca na web. A
    // de operação recebe as ferramentas fluxo_*; a de conversa (`conversation`)
    // não recebe ferramenta nenhuma e usa as próprias instruções.
    async startThread(params = {}) {
      await this.initialize();
      return (await getTransport()).request('thread/start', parametrosDeThread(params, domainTools));
    },

    // Retoma uma thread gravada pelo app-server (sobrevive ao reinício do processo),
    // com as mesmas restrições e ferramentas de uma thread nova.
    async resumeThread(threadId, params = {}) {
      await this.initialize();
      return (await getTransport()).request('thread/resume', { threadId, ...parametrosDeThread(params, domainTools) });
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
    // Quem observa (a conversa) recebe início e fim de cada ferramenta, para narrar.
    const chamada = { tool: String(params.tool ?? ''), arguments: params.arguments ?? {}, runId, threadId: String(params.threadId ?? ''), turnId: String(params.turnId ?? '') };
    try { onToolCall({ phase: 'started', ...chamada }); } catch {}
    try {
      const result = await domainTools.call(params.tool, params.arguments, runId);
      // `imagem` (data URL) vai ao modelo como imagem, fora do texto e fora dos
      // observadores: a tela da pessoa não entra em histórico nem em narração.
      const imagem = typeof result?.imagem === 'string' && result.imagem.startsWith('data:image/') ? result.imagem : null;
      const texto = imagem ? Object.fromEntries(Object.entries(result).filter(([chave]) => chave !== 'imagem')) : result;
      try { onToolCall({ phase: 'completed', ...chamada, ok: true, result: texto }); } catch {}
      return { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify(texto) }, ...(imagem ? [{ type: 'inputImage', imageUrl: imagem }] : [])] };
    } catch (error) {
      try { onToolCall({ phase: 'completed', ...chamada, ok: false, error: { code: error.code ?? 'tool_failed', message: error.message } }); } catch {}
        // `details` leva ao modelo o que explica a falha (ex.: diagnóstico de console/rede).
        return { success: false, contentItems: [{ type: 'inputText', text: JSON.stringify({ code: error.code ?? 'tool_failed', message: error.message, ...(error.details ? { details: error.details } : {}) }) }] };
    }
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
