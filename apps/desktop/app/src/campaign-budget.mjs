import { campaignLimitsFrom } from './product-policy.mjs';
import { createDomainError } from './domain/errors.mjs';

export function createCampaignBudget({ config = {}, persistence, now = () => new Date() } = {}) {
  const limits = campaignLimitsFrom(config);
  const state = persistence ?? {
    submitted: 0,
    consecutiveFailures: 0,
    tokens: 0,
    startedAt: now().toISOString(),
    cancelled: false,
    pausedForUser: false
  };

  return {
    limits,
    snapshot() { return { ...state, limits }; },

    assertCanAct(kind = 'external') {
      if (state.cancelled) throw createDomainError('campaign_cancelled', 'A campanha foi cancelada. Nenhuma nova ação externa é permitida.');
      if (kind === 'external' && Number(state.submitted) >= limits.maxApplicationsPerRun) {
        throw createDomainError('run_application_limit_reached', 'O limite de candidaturas desta execução foi atingido.');
      }
      if (Number(state.consecutiveFailures) >= limits.maxConsecutiveFailures) {
        throw createDomainError('consecutive_failures_limit', 'O circuito de falhas consecutivas pausou novas tentativas.');
      }
      if (elapsed(state.startedAt, now) > limits.maxRunDurationMs) {
        throw createDomainError('run_duration_limit', 'A duração máxima desta execução foi atingida.');
      }
      if (Number(state.tokens) >= limits.maxRunTokens) {
        throw createDomainError('run_token_limit', 'O orçamento de consumo desta execução foi atingido.');
      }
      return true;
    },

    recordSubmission() { state.submitted += 1; state.consecutiveFailures = 0; },
    recordFailure() { state.consecutiveFailures += 1; },
    recordSuccess() { state.consecutiveFailures = 0; },
    recordTokens(count = 0) { state.tokens += Number(count) || 0; },
    cancel() { state.cancelled = true; },
    waitForUser() { state.pausedForUser = true; },
    resumeFromUser() { state.pausedForUser = false; },
    childBudget() {
      return createCampaignBudget({ config, persistence: state, now });
    }
  };
}

function elapsed(startedAt, now) {
  const start = Date.parse(startedAt);
  return Number.isFinite(start) ? now().getTime() - start : 0;
}
