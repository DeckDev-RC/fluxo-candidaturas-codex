import { extractStructuredFacts } from './fact-extractor.mjs';
import { applyCampaignFilters } from './campaign-filters.mjs';
import { buildPlatformSearch } from './platform-search.mjs';
import { classifyCompletion } from './completion-states.mjs';
import { chooseAgentTool } from './agent-contracts.mjs';
import { createDomainError } from './domain/errors.mjs';

export function createProductionAgents({
  intakeService, discoveryService, fitService, followUpMonitor, applicationFlow,
  memoryService, resumeImportService, campaignService, runtimeConfig = {}
} = {}) {
  // A ferramenta anunciada em cada evento é a que existe de fato neste ambiente,
  // conforme o contrato do especialista. Nada é rotulado como fixture na produção.
  const disponiveis = {
    file: Boolean(intakeService),
    script: Boolean(fitService),
    playwright: Boolean(discoveryService || applicationFlow || followUpMonitor),
    api: false,
    fixture: false
  };
  const ferramenta = (agente) => chooseAgentTool(agente, disponiveis);

  return {
    intake: {
      name: 'intake',
      instructions: 'Importar materiais, extrair fatos com origem e não confirmar inferências.',
      tools: ['fluxo_import_resume', 'fluxo_record_gap', 'fluxo_profile'],
      async run(context) {
        assertAvailable('intake', intakeService);
        if (context.input?.answers) await memoryService?.recordAnswers?.(context.input.answers);
        const imported = context.input?.importedResume;
        const text = imported?.text ?? context.input?.resumeText ?? '';
        const source = imported?.path ?? context.input?.resumePath ?? 'curriculo/local';
        const extracted = extractStructuredFacts({ text, source });
        // Fatos já confirmados na memória vencem a nova extração: uma lacuna respondida
        // antes (ou em outra sessão) não volta a ser perguntada.
        const remembered = (await memoryService?.safeSummary?.())?.facts ?? {};
        const preview = await intakeService.preview({
          source,
          text,
          documents: [{ path: source, text }],
          facts: { ...extracted.facts, ...remembered }
        });
        const gaps = preview.missing ?? [];
        if (gaps.length) {
          return waiting('intake', `Preciso de ${gaps.length} informação(ões) para buscar com segurança.`, { preview, questions: preview.questions, missing: gaps }, 'fluxo_record_gap');
        }
        return ok('intake', ferramenta('intake'), 'Perfil estruturado com origem e pendências explícitas.', preview, preview.ready === true);
      }
    },
    discovery: {
      name: 'discovery',
      instructions: 'Construir busca a partir dos filtros da campanha, paginar e deduplicar.',
      tools: ['fluxo_discover'],
      async run(context) {
        assertAvailable('discovery', discoveryService);
        if (context.mode === 'fixture') throw createDomainError('fixture_forbidden', 'O caminho de produção não usa adapters fixture.');
        const campaign = await campaignService?.getCampaign?.() ?? {};
        // Seleção vazia usa as plataformas habilitadas na campanha; nunca a lista completa.
        const requested = list(context.input?.platforms);
        const platforms = requested.length ? requested : enabledPlatforms(campaign);
        if (!platforms.length) throw createDomainError('campaign_platforms_required', 'Habilite ao menos uma plataforma na campanha antes de buscar.');
        const searches = buildPlatformSearch({
          filters: { ...campaign.filters, roles: context.input?.targetRoles ?? campaign.filters?.roles },
          platforms,
          baseUrls: runtimeConfig.platformUrls ?? {}
        });
        const result = await discoveryService.discover({
          ...context.input,
          runId: context.runId,
          platforms: searches.filter((item) => !item.unavailable).map((item) => item.platform),
          searchPlan: searches
        });
        return ok('discovery', ferramenta('discovery'), `Observei ${result.created.length} oportunidade(s).`, { ...result, searches }, true);
      }
    },
    fit: {
      name: 'fit',
      instructions: 'Aplicar filtros eliminatórios usando fatos confirmados e descrição observada.',
      tools: ['fluxo_shortlist'],
      async run(context) {
        assertAvailable('fit', fitService);
        const facts = context.outputs.intake?.facts ?? (await memoryService.safeSummary()).facts;
        const opportunities = context.outputs.discovery?.created ?? context.outputs.discovery?.opportunities ?? [];
        const campaign = await campaignService?.getCampaign?.() ?? {};
        const filtered = opportunities.map((opportunity) => ({ opportunity, filter: applyCampaignFilters(opportunity, campaign.filters ?? context.input?.filters ?? {}, facts) }));
        const eligible = filtered.filter((item) => item.filter.eligible).map((item) => item.opportunity);
        const result = fitService.shortlist({ opportunities: eligible, facts, limit: Number(context.input?.limit ?? 10) });
        result.rejected = filtered.filter((item) => !item.filter.eligible).map((item) => ({ ...item.opportunity, reason: item.filter.explanation }));
        return ok('fit', ferramenta('fit'), `Comparei ${result.items.length} oportunidade(s) elegíveis.`, result, true);
      }
    },
    application: {
      name: 'application',
      instructions: 'Preparar revisão observada. Nunca aprovar nem inventar confirmação.',
      tools: ['fluxo_prepare', 'fluxo_fill', 'fluxo_review', 'fluxo_submit'],
      async run(context) {
        assertAvailable('application', applicationFlow);
        const selected = context.outputs.fit?.items ?? [];
        if (!selected.length) return ok('application', ferramenta('application'), 'Nenhuma candidatura elegível nesta rodada.', { prepared: 0 }, true);
        if (!context.input?.approvalId) {
          return waiting('application', 'Revisão humana obrigatória antes do envio.', { prepared: selected.length, reviewRequired: true }, 'fluxo_review');
        }
        return ok('application', ferramenta('application'), 'Revisão aprovada encaminhada ao fluxo de envio.', { prepared: selected.length }, false);
      }
    },
    followup: {
      name: 'followup',
      instructions: 'Consultar novidades sem tratar ausência de adaptador como nenhuma novidade.',
      tools: ['fluxo_followup'],
      async run(context) {
        assertAvailable('followup', followUpMonitor);
        const result = await followUpMonitor.check({
          applications: context.input?.applications ?? [],
          instruction: context.input?.instruction ?? ''
        });
        const completion = classifyCompletion({ emptyQueue: false, modelSaidDone: false });
        return ok('followup', ferramenta('followup'), result.summary, { ...result, campaignComplete: completion.complete }, true);
      }
    }
  };
}

function enabledPlatforms(campaign) {
  return (campaign.platforms ?? []).filter((item) => item.enabled !== false);
}

function list(value) {
  return (Array.isArray(value) ? value : [value]).filter((item) => String(item ?? '').trim());
}

function assertAvailable(name, service) {
  if (!service) throw createDomainError('agent_contract_unavailable', `O especialista ${name} está indisponível.`);
}

function ok(task, tool, observation, result, confirmed) {
  return { status: 'succeeded', task, tool, observation, result, confirmed, identity: `production:${task}` };
}

function waiting(task, observation, result, tool) {
  return { status: 'waiting_user', task, tool, observation, result, confirmed: false, identity: `production:${task}` };
}
