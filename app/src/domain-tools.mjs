import { acquireFluxoLock } from './lock.mjs';

import { validateToolInput } from './tool-validation.mjs';
import { assertTrustedPath } from './trust-boundary.mjs';
import { createRecoveryGuidance } from './recovery-service.mjs';

// Ferramentas que agem fora do computador passam pelo mesmo orçamento da campanha:
// chamar a ferramenta direto não é caminho para furar limite (F0-06, F2-05).
const ACAO_EXTERNA = new Set(['fluxo_discover', 'fluxo_prepare', 'fluxo_fill', 'fluxo_submit', 'fluxo_reconcile']);
const LEITURA_EXTERNA = new Set(['fluxo_followup']);
const ESCOPOS_DE_ESTADO = new Set(['campaign', 'queue', 'applications', 'installation', 'preflight', 'checkpoint', 'memory', 'discovery', 'followup', 'exceptions']);

export function createDomainTools({ rootDir, readState, discoveryService, fitService, memoryService, applicationFlow, browserAdapter, followUpMonitor, runService, resumeImportService, budget } = {}) {
  const string = { type: 'string' };
  // Parâmetro de escopo é opcional: a ferramenta continua válida com `{}`.
  const opcional = (type) => ({ type, optional: true });
  const entries = [
    // Ferramentas de leitura aceitam escopo para não trazer o estado inteiro
    // quando só uma parte importa.
    ['fluxo_state', 'Ler campanha, fila e estado persistido; use scope para limitar a leitura.', { scope: opcional('string') }, async (input) => {
      const estado = await readState();
      const escopo = String(input.scope ?? 'all');
      if (escopo === 'all') return estado;
      if (!ESCOPOS_DE_ESTADO.has(escopo)) throw fail('invalid_scope');
      return { [escopo]: estado[escopo] };
    }],
    ['fluxo_profile', 'Ler fatos confirmados do perfil local; use scope para uma única informação.', { scope: opcional('string') }, async (input) => {
      const resumo = await memoryService.safeSummary();
      const escopo = String(input.scope ?? 'all');
      if (escopo === 'all') return resumo;
      if (!resumo.facts?.[escopo]) throw fail('unknown_profile_fact');
      return { facts: { [escopo]: resumo.facts[escopo] } };
    }],
    ['fluxo_import_resume', 'Importar currículo enviado pelo usuário após verificar integridade.', { filename: string, contentBase64: string }, async input => resumeImportService.importFile(input)],
    ['fluxo_record_gap', 'Registrar lacuna respondida na memória persistente.', { key: string, value: string }, async input => memoryService.recordAnswers({ [input.key]: input.value })],
    ['fluxo_attach_resume', 'Registrar a variante de currículo usada, com hash.', { path: string, sha256: string }, async input => {
      assertTrustedPath(input.path);
      return memoryService.saveResumeVariant({ path: input.path, sha256: input.sha256, selected: true, source: 'seleção da campanha' });
    }],
    ['fluxo_discover', 'Observar vagas na página HTTP configurada; exige página suportada.', { searchUrl: string, platform: string }, async input => {
      const state = await readState(); if (!state.installation.ready) throw fail('preflight_blocked');
      return discoveryService.discover({ searchUrl: input.searchUrl, platforms: [input.platform] });
    }],
    ['fluxo_shortlist', 'Comparar vagas com os fatos confirmados; limit define quantas retornar.', { limit: opcional('number') }, async (input) => fitService.shortlist({
      opportunities: (await readState()).queue.items,
      facts: (await memoryService.safeSummary()).facts,
      limit: Number(input.limit ?? 10)
    })],
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
    ['fluxo_reconcile', 'Recuperar envio incerto sem repetir o clique.', { runId: string, phase: string }, async (input, parentRunId) => {
      owned(input.runId, parentRunId);
      return { guidance: createRecoveryGuidance({ phase: input.phase, runId: input.runId }), result: await applicationFlow.reconcileRun(input.runId) };
    }],
    ['fluxo_followup', 'Observar novidades nas candidaturas registradas; reference limita a uma candidatura.', { reference: opcional('string') }, async (input) => {
      const referencia = String(input.reference ?? '').trim();
      if (!referencia) return followUpMonitor.check();
      const candidaturas = (await readState()).applications.items.filter((item) => [item.id, item.key, item.applicationId, item.identifierOrUrl].includes(referencia));
      if (!candidaturas.length) throw fail('application_not_found');
      return followUpMonitor.check({ applications: candidaturas });
    }]
  ];
  const map = new Map(entries.map(entry => [entry[0], entry]));
  return {
    definitions: entries.map(([name, description, properties]) => ({ type: 'function', name, description, inputSchema: { type: 'object', properties: publicSchema(properties), required: Object.entries(properties).filter(([, schema]) => !schema.optional).map(([key]) => key), additionalProperties: false } })),
    async call(name, input, runId) {
      const entry = map.get(name); if (!entry) throw fail('tool_not_allowed');
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('invalid_tool_arguments');
      for (const key of Object.keys(input)) if (!entry[2][key]) throw fail('invalid_tool_arguments');
      for (const [key, schema] of Object.entries(entry[2])) {
        if (schema.type === 'object') {
          if (!input[key] || typeof input[key] !== 'object' || Array.isArray(input[key])) throw fail('invalid_tool_arguments');
          continue;
        }
        if (schema.optional && input[key] === undefined) continue;
        if (typeof input[key] !== schema.type || input[key] === null) throw fail('invalid_tool_arguments');
      }
      validateToolInput(name, input, { parentRunId: runId });
      if (runService && runService.getRun(runId)?.status !== 'running') throw fail('run_not_running');
      if (ACAO_EXTERNA.has(name)) budget?.assertCanAct?.('external');
      if (LEITURA_EXTERNA.has(name)) budget?.assertCanAct?.('read');
      const release = rootDir ? await acquireFluxoLock(rootDir) : async () => {};
      try {
        const resultado = await entry[3](input, runId);
        if (name === 'fluxo_submit') budget?.recordSubmission?.();
        return resultado;
      } finally { await release(); }
    }
  };
  function owned(id, parentRunId) {
    const workflow = applicationFlow.getWorkflow(id);
    if (!workflow || workflow.parentRunId !== parentRunId) throw fail('tool_run_mismatch');
    return workflow;
  }
}
// O marcador interno de opcional não vaza para o esquema anunciado ao runtime.
function publicSchema(properties) {
  return Object.fromEntries(Object.entries(properties).map(([key, schema]) => [key, schema.optional ? { type: schema.type } : schema]));
}

function fail(code) { return Object.assign(new Error('A ferramenta não pode executar esta ação com o contexto informado.'), { code }); }
