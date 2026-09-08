import { applyCampaignFilters } from './campaign-filters.mjs';

export function createFitService({ recordDecision = async () => {}, queueService = null, now = () => new Date() } = {}) {
  return {
    // Grava na fila a nota e a classificação de tudo o que foi comparado, para a
    // ordenação e a tela refletirem a comparação real (não só o retorno da chamada).
    async record(result = {}) {
      if (!queueService?.recordFit) return { updated: 0 };
      const avaliadas = [...(result.items ?? []), ...(result.excluded ?? [])].map((item) => item.fit).filter(Boolean);
      return queueService.recordFit(avaliadas);
    },
    assess({ opportunity = {}, facts = {}, filters = {} } = {}) {
      const required = list(opportunity.requirements);
      const eliminators = list(opportunity.eliminators);
      const haystack = Object.values(facts).flatMap((fact) => flatten(fact?.confirmed === false ? [] : (fact?.value ?? fact))).join(' ').toLocaleLowerCase();
      const matched = required.filter((term) => haystack.includes(term.toLocaleLowerCase()));
      const gaps = required.filter((term) => !matched.includes(term));
      const blocked = eliminators.filter((term) => haystack.includes(term.toLocaleLowerCase()));
      const campaignFilter = applyCampaignFilters(opportunity, filters, facts);
      const score = required.length ? Math.round(matched.length * 100 / required.length) : 50;
      const classification = blocked.length || !campaignFilter.eligible || score < 50 ? 'fraca' : score >= 80 ? 'forte' : 'possível';
      const eligible = !blocked.length && campaignFilter.eligible && classification !== 'fraca';
      const level = score >= 80 ? 'alta' : score >= 50 ? 'média' : 'baixa';
      return { opportunityId: String(opportunity.id ?? opportunity.key ?? ''), score, classification, eligible, confidence: level, matched, gaps, eliminators: blocked, explanation: explanation({ matched, gaps, blocked, classification }), evaluatedAt: now().toISOString() };
    },

    shortlist({ opportunities = [], facts = {}, limit = 10, includeWeak = false } = {}) {
      const assessments = opportunities.map((opportunity) => ({ ...opportunity, fit: this.assess({ opportunity, facts }) }));
      const eligible = assessments.filter((item) => item.fit.eligible || includeWeak).sort((left, right) => right.fit.score - left.fit.score || String(left.company).localeCompare(String(right.company)));
      const items = eligible.slice(0, Math.max(0, Number(limit) || 0));
      return { items, excluded: assessments.filter((item) => !items.includes(item)), generatedAt: now().toISOString(), nextAction: items.length ? 'Revisar as oportunidades fortes e possíveis.' : 'Complete o perfil ou ajuste os filtros para encontrar aderências.' };
    },

    async override({ opportunityId, decision, reason }) {
      if (!['include', 'exclude'].includes(decision) || !String(reason ?? '').trim()) throw domainError('invalid_fit_override', 'Decisão e motivo são obrigatórios.');
      const value = { opportunityId: String(opportunityId), decision, reason: String(reason).trim(), recordedAt: now().toISOString() };
      await recordDecision(value);
      return value;
    }
  };
}

function flatten(value) { return Array.isArray(value) ? value : [value]; }
function list(value) { return Array.isArray(value) ? value.map(String).filter(Boolean) : String(value ?? '').split(/,|;/).map((item) => item.trim()).filter(Boolean); }
function explanation({ matched, gaps, blocked, classification }) { if (blocked.length) return `Aderência ${classification}: há requisito eliminatório (${blocked.join(', ')}).`; return `Aderência ${classification}: ${matched.length} requisitos atendidos${gaps.length ? ` e ${gaps.length} lacunas` : ', sem lacunas identificadas'}.`; }
function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
