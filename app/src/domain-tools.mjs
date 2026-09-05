import { acquireFluxoLock } from './lock.mjs';

export function createDomainTools({ rootDir, readState, discoveryService, fitService, memoryService, applicationFlow, browserAdapter, followUpMonitor, runService } = {}) {
  const string = { type: 'string' };
  const entries = [
    ['fluxo_state', 'Ler campanha, fila e estado persistido.', {}, async () => readState()],
    ['fluxo_profile', 'Ler fatos confirmados do perfil local.', {}, async () => memoryService.safeSummary()],
    ['fluxo_discover', 'Observar vagas na página HTTP configurada; exige página suportada.', { searchUrl: string, platform: string }, async input => {
      const state = await readState(); if (!state.installation.ready) throw fail('preflight_blocked');
      return discoveryService.discover({ searchUrl: input.searchUrl, platforms: [input.platform] });
    }],
    ['fluxo_shortlist', 'Comparar vagas com os fatos confirmados.', {}, async () => fitService.shortlist({ opportunities: (await readState()).queue.items, facts: (await memoryService.safeSummary()).facts })],
    ['fluxo_prepare', 'Reservar vaga e abrir formulário; retorna referências observadas.', { itemId: string }, async (input, parentRunId) => applicationFlow.prepareNext({ itemId: input.itemId, parentRunId })],
    ['fluxo_fill', 'Preencher referências do formulário usando somente chaves do perfil confirmado.', { runId: string, fieldMap: { type: 'object', additionalProperties: string } }, async (input, parentRunId) => {
      const workflow = owned(input.runId, parentRunId);
      const memory = await memoryService.safeSummary(); const facts = {};
      for (const [ref, key] of Object.entries(input.fieldMap)) {
        const fact = memory.facts?.[key];
        if (fact?.confirmed !== true) throw fail('unconfirmed_profile_fact');
        facts[ref] = { value: fact.value, confirmed: true };
      }
      return applicationFlow.fillConfirmed(workflow.prepared, facts);
    }],
    ['fluxo_review', 'Solicitar revisão humana do formulário atual; nunca decide a aprovação.', { runId: string }, async (input, parentRunId) => {
      const workflow = owned(input.runId, parentRunId);
      const snapshot = await browserAdapter.assertContext(workflow.prepared.snapshot, workflow.prepared.item);
      const prepared = { ...workflow.prepared, snapshot };
      applicationFlow.savePrepared(input.runId, prepared);
      return applicationFlow.requestSubmissionApproval(input.runId, { queueItemId: prepared.item.id, fields: snapshot });
    }],
    ['fluxo_submit', 'Enviar somente com aprovação humana válida da revisão salva.', { runId: string, approvalId: string }, async (input, parentRunId) => {
      const workflow = owned(input.runId, parentRunId);
      return applicationFlow.submitApproved(workflow.prepared, input.approvalId, workflow.approvedPayload);
    }],
    ['fluxo_followup', 'Observar novidades nas candidaturas registradas.', {}, async () => followUpMonitor.check()]
  ];
  const map = new Map(entries.map(entry => [entry[0], entry]));
  return {
    definitions: entries.map(([name, description, properties]) => ({ type: 'function', name, description, inputSchema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } })),
    async call(name, input, runId) {
      const entry = map.get(name); if (!entry) throw fail('tool_not_allowed');
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('invalid_tool_arguments');
      for (const key of Object.keys(input)) if (!entry[2][key]) throw fail('invalid_tool_arguments');
      for (const [key, schema] of Object.entries(entry[2])) if (typeof input[key] !== schema.type || input[key] === null) throw fail('invalid_tool_arguments');
      if (runService && runService.getRun(runId)?.status !== 'running') throw fail('run_not_running');
      const release = rootDir ? await acquireFluxoLock(rootDir) : async () => {};
      try { return await entry[3](input, runId); } finally { await release(); }
    }
  };
  function owned(id, parentRunId) {
    const workflow = applicationFlow.getWorkflow(id);
    if (!workflow || workflow.parentRunId !== parentRunId) throw fail('tool_run_mismatch');
    return workflow;
  }
}
function fail(code) { return Object.assign(new Error('A ferramenta não pode executar esta ação com o contexto informado.'), { code }); }
