import { acquireFluxoLock } from './lock.mjs';

import { validateToolInput } from './tool-validation.mjs';
import { assertTrustedPath } from './trust-boundary.mjs';
import { createRecoveryGuidance } from './recovery-service.mjs';
import { buildPlatformSearch, platformHome } from './platform-search.mjs';
import { extractDocumentText } from './document-extract.mjs';
import { browserFreeTools, FERRAMENTAS_LIVRES_DE_ACAO, FERRAMENTAS_LIVRES_DE_LEITURA } from './browser-free-tools.mjs';
import { appConfigTools } from './app-config-tools.mjs';
import { join } from 'node:path';

const LIMITE_TEXTO_CURRICULO = 12_000;

// Ferramentas que agem fora do computador passam pelo mesmo orçamento da campanha:
// chamar a ferramenta direto não é caminho para furar limite (F0-06, F2-05).
const ACAO_EXTERNA = new Set(['fluxo_discover', 'fluxo_prepare', 'fluxo_fill', 'fluxo_submit', 'fluxo_reconcile']);
// Navegação livre conta como leitura externa: passa por cancelamento, falhas e
// tokens da campanha, mas não pelo limite de candidaturas (não é um envio).
const LEITURA_EXTERNA = new Set(['fluxo_followup', 'fluxo_open_platform', 'fluxo_read_job', ...FERRAMENTAS_LIVRES_DE_LEITURA, ...FERRAMENTAS_LIVRES_DE_ACAO]);
const ESCOPOS_DE_ESTADO = new Set(['campaign', 'queue', 'applications', 'installation', 'preflight', 'checkpoint', 'memory', 'discovery', 'followup', 'exceptions']);

export function createDomainTools({ rootDir, readState, discoveryService, fitService, memoryService, applicationFlow, browserAdapter, followUpMonitor, runService, resumeImportService, intakeService, queueService, campaignService = null, schedulerService = null, codexSettingsService = null, exportService = null, auditService = null, budget, platformUrls = () => ({}) } = {}) {
  const string = { type: 'string' };
  // Parâmetro de escopo é opcional: a ferramenta continua válida com `{}`.
  const opcional = (type) => ({ type, optional: true });
  const entries = [
    // Ferramentas de leitura aceitam escopo para não trazer o estado inteiro
    // quando só uma parte importa.
    ['fluxo_state', `Ler campanha, fila e estado persistido. scope opcional, um de: ${[...ESCOPOS_DE_ESTADO].join(', ')} (sem scope, tudo).`, { scope: opcional('string') }, async (input) => {
      const estado = await readState();
      const escopo = String(input.scope ?? 'all');
      if (escopo === 'all') return estado;
      // Escopo inventado ("summary", "resumo") não é motivo para falhar uma leitura:
      // devolve tudo e diz quais escopos existem, em vez de virar "Não deu certo" na conversa.
      if (!ESCOPOS_DE_ESTADO.has(escopo)) return { ...estado, scopeNote: `Escopo "${escopo}" não existe; devolvido o estado completo. Escopos: ${[...ESCOPOS_DE_ESTADO].join(', ')}.` };
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
    // Ler o currículo é o primeiro passo da IA: o texto vem com os dados que o
    // extrator reconheceu, ainda não confirmados, para a pessoa validar de uma vez.
    ['fluxo_read_resume', 'Ler o texto do currículo selecionado e os dados reconhecidos nele, ainda não confirmados; peça confirmação antes de gravar. Omita path (usa o currículo selecionado); se informar, use a forma curriculo/arquivo.ext.', { path: opcional('string') }, async (input) => {
      const resumo = await memoryService.safeSummary();
      // Um nome de arquivo solto é procurado na pasta de currículos.
      const informado = String(input.path ?? '').trim().replaceAll('\\', '/');
      const caminho = informado ? (informado.includes('/') ? informado : `curriculo/${informado}`) : String(resumo.selectedResume?.path ?? '').trim();
      if (!caminho) throw fail('resume_not_selected');
      assertTrustedPath(caminho);
      if (!caminho.startsWith('curriculo/')) throw fail('invalid_path');
      const texto = await extractDocumentText(join(rootDir, caminho));
      const previa = intakeService ? await intakeService.preview({ documents: [{ path: caminho, text: texto }] }) : { facts: {}, missing: [] };
      const reconhecidos = Object.fromEntries(Object.entries(previa.facts ?? {}).filter(([chave]) => !resumo.facts?.[chave]?.confirmed).map(([chave, fato]) => [chave, fato.value]));
      return { path: caminho, text: texto.slice(0, LIMITE_TEXTO_CURRICULO), truncated: texto.length > LIMITE_TEXTO_CURRICULO, recognized: reconhecidos, missing: previa.missing ?? [] };
    }],
    ['fluxo_record_gap', 'Registrar lacuna respondida na memória persistente.', { key: string, value: string }, async input => memoryService.recordAnswers({ [input.key]: input.value })],
    ['fluxo_attach_resume', 'Registrar a variante de currículo usada, com hash.', { path: string, sha256: string }, async input => {
      assertTrustedPath(input.path);
      return memoryService.saveResumeVariant({ path: input.path, sha256: input.sha256, selected: true, source: 'seleção da campanha' });
    }],
    // Abrir a plataforma na aba dela é o primeiro passo da IA em cada site: a
    // resposta diz se a pessoa precisa entrar (login) ou resolver um desafio.
    ['fluxo_open_platform', 'Abrir a página de entrada da plataforma na aba dela, no navegador visível; informa se há login pendente ou desafio (CAPTCHA/MFA).', { platform: string }, async (input) => {
      const url = platformHome(input.platform, platformUrls());
      if (!url) throw fail('unknown_platform');
      return browserAdapter.openPlatform(String(input.platform).toUpperCase(), url);
    }],
    ['fluxo_browser_status', 'Listar as abas abertas do navegador por plataforma, com URL, título, login pendente e desafio.', {}, async () => ({ tabs: await browserAdapter.tabs() })],
    // A busca é feita na plataforma da aba; sem `searchUrl`, a URL vem do
    // objetivo confirmado e do catálogo (ou da URL configurada no .env).
    ['fluxo_discover', 'Observar vagas na plataforma. query é o termo pedido pela pessoa (ex.: "COBOL"); sem query nem searchUrl, usa o objetivo confirmado. As vagas ficam marcadas com a busca que as trouxe. Exige plataforma habilitada na campanha.', { platform: string, query: opcional('string'), searchUrl: opcional('string') }, async input => {
      const state = await readState();
      const plataforma = String(input.platform).toUpperCase();
      // O que bloqueia a busca é a campanha, não um preflight herdado: a IA já
      // cuidou de perfil e login antes de chegar aqui.
      const habilitada = (state.campaign?.platforms ?? []).some((item) => String(item.name).toUpperCase() === plataforma && item.enabled !== false);
      if (!habilitada) throw fail('platform_disabled');
      let searchUrl = String(input.searchUrl ?? '').trim();
      let query = String(input.query ?? '').trim();
      if (!searchUrl) {
        const facts = (await memoryService.safeSummary()).facts ?? {};
        const [busca] = buildPlatformSearch({ filters: { roles: query || facts.targetRoles?.value, location: facts.location?.value }, platforms: [plataforma], baseUrls: platformUrls() });
        if (!busca || busca.unavailable || !busca.searchUrl) throw fail('search_unavailable');
        searchUrl = busca.searchUrl;
        query = query || String(busca.query ?? '');
      }
      return discoveryService.discover({ searchUrl, platforms: [plataforma], query });
    }],
    // Ler a página da vaga transforma "aderência possível 50%" (lista sem requisitos)
    // em medida real: requisitos, modalidade e local gravados na vaga e nota recalculada.
    ['fluxo_read_job', 'Abrir a página da vaga e ler descrição, requisitos, modalidade e local; grava na vaga e recalcula a aderência. Use nas melhores candidatas antes de preparar.', { itemId: string }, async (input) => {
      const item = (await readState()).queue.items.find((candidato) => candidato.id === input.itemId || candidato.key === input.itemId);
      if (!item) throw fail('queue_item_not_found');
      const leitura = await browserAdapter.readJob(item);
      const atualizado = await queueService.updateItemDetails(item.id, { requirements: leitura.requirements, eliminators: leitura.eliminators, niceToHave: leitura.niceToHave, description: leitura.description, workMode: leitura.workMode, salary: leitura.salary, location: leitura.location, contract: leitura.contract, company: leitura.company });
      const facts = (await memoryService.safeSummary()).facts ?? {};
      const fit = fitService.assess({ opportunity: atualizado, facts });
      await queueService.recordFit?.([fit]);
      return { itemId: atualizado.id, role: atualizado.role, company: atualizado.company, location: atualizado.location ?? '', requirements: atualizado.requirements ?? [], eliminators: atualizado.eliminators ?? [], niceToHave: atualizado.niceToHave ?? [], workMode: atualizado.workMode ?? '', salary: atualizado.salary ?? '', contract: atualizado.contract ?? '', applyAvailable: leitura.applyAvailable ?? null, applyLabel: leitura.applyLabel ?? '', description: String(atualizado.description ?? '').slice(0, 1500), fit: { score: fit.score, classification: fit.classification, matched: fit.matched, gaps: fit.gaps, explanation: fit.explanation } };
    }],
    // A pessoa manda: vagas de uma busca antiga ou que ela não quer saem da fila
    // ativa e não voltam como novidade. Descarte é decisão dela, nunca da IA sozinha.
    ['fluxo_discard', 'Descartar vagas da fila a pedido da pessoa: por itemIds (separados por vírgula) ou por texto de cargo/empresa (query). Elas saem da fila e não voltam na próxima busca.', { itemIds: opcional('string'), query: opcional('string'), reason: string }, async (input) => {
      if (!queueService?.discardItems) throw fail('discard_unavailable');
      return queueService.discardItems({ ids: String(input.itemIds ?? '').split(',').map((id) => id.trim()).filter(Boolean), query: input.query ?? '', reason: input.reason });
    }],
    ['fluxo_shortlist', 'Comparar vagas com os fatos confirmados; limit define quantas retornar. A nota fica gravada em cada vaga. Só considera vagas ativas (não descartadas).', { limit: opcional('number') }, async (input) => {
      const resultado = fitService.shortlist({
        opportunities: (await readState()).queue.items.filter((item) => ['na fila', 'em andamento'].includes(item.status)),
        facts: (await memoryService.safeSummary()).facts,
        limit: Number(input.limit ?? 10)
      });
      await fitService.record?.(resultado);
      return resultado;
    }],
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
    }],
    // Navegação livre e configuração do app ficam em módulos próprios; entram no
    // mesmo contrato (validação, orçamento, trava) por este mapa.
    ...browserFreeTools({ browserAdapter, string, opcional }),
    ...appConfigTools({ campaignService, schedulerService, codexSettingsService, exportService, auditService, runService, string, opcional })
  ];
  const map = new Map(entries.map(entry => [entry[0], entry]));
  return {
    definitions: entries.map(([name, description, properties]) => ({ type: 'function', name, description, inputSchema: { type: 'object', properties: publicSchema(properties), required: Object.entries(properties).filter(([, schema]) => !schema.optional).map(([key]) => key), additionalProperties: false } })),
    async call(name, input, runId) {
      const entry = map.get(name); if (!entry) throw fail('tool_not_allowed');
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('invalid_tool_arguments');
      for (const key of Object.keys(input)) if (!entry[2][key]) throw fail('invalid_tool_arguments');
      for (const [key, schema] of Object.entries(entry[2])) {
        if (schema.optional && input[key] === undefined) continue;
        if (schema.type === 'object') {
          if (!input[key] || typeof input[key] !== 'object' || Array.isArray(input[key])) throw fail('invalid_tool_arguments');
          continue;
        }
        if (schema.type === 'array') {
          const itemType = schema.items?.type ?? 'string';
          if (!Array.isArray(input[key]) || input[key].some((item) => typeof item !== itemType || item === null)) throw fail('invalid_tool_arguments');
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
  return Object.fromEntries(Object.entries(properties).map(([key, schema]) => [key, schema.optional ? { type: schema.type, ...(schema.items ? { items: schema.items } : {}) } : schema]));
}

function fail(code) { return Object.assign(new Error('A ferramenta não pode executar esta ação com o contexto informado.'), { code }); }
