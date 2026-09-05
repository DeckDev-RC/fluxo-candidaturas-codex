import { createDomainError } from './domain/errors.mjs';
import { EXTERNAL_ACTIONS, assertHumanDecision } from './product-policy.mjs';

const APPROVAL_KINDS = new Set(['submission', 'sensitive_data', 'timed_test', 'message', 'withdrawal', 'profile_change']);
const DEFAULT_ACTION_VERSION = 'v1';

// Nome da ação no gateway → nome na política do produto.
const ACAO_EXTERNA_EQUIVALENTE = {
  submission: 'submit',
  sensitive_data: 'fill_sensitive',
  message: 'recruiter_message',
  timed_test: 'timed_test'
};

// Decisão pessoal que autorização de campanha nunca dispensa (F0-05). O envio
// continua governado pela configuração: é o único ponto em que a pessoa pode
// autorizar antecipadamente uma campanha inteira.
const NUNCA_DISPENSADAS = new Set(Object.entries(ACAO_EXTERNA_EQUIVALENTE)
  .filter(([kind, externa]) => kind !== 'submission' && EXTERNAL_ACTIONS[externa]?.decider === 'user')
  .map(([kind]) => kind));

export function evaluateAction(action = {}, context = {}) {
  const normalizedAction = normalizeAction(action);
  if (['captcha', 'mfa', 'biometric'].includes(context.browserChallenge)) {
    return policyResult(normalizedAction, { allowed: false, requiresApproval: false, code: 'manual_intervention_required' });
  }
  if (normalizedAction.kind === 'sensitive_data' && context.sensitiveConfirmed !== true) {
    return policyResult(normalizedAction, { allowed: false, requiresApproval: false, code: 'sensitive_confirmation_required' });
  }

  const requiresApproval = APPROVAL_KINDS.has(normalizedAction.kind)
    && (NUNCA_DISPENSADAS.has(normalizedAction.kind) || context.requireFinalConfirmation !== false || normalizedAction.kind !== 'submission' || context.allowAutomatedSubmission !== true);
  return policyResult(normalizedAction, {
    allowed: !requiresApproval,
    requiresApproval,
    code: requiresApproval ? 'approval_required' : 'allowed'
  });
}

export function createPolicyGateway({ approvalService, context = {} } = {}) {
  return {
    evaluate(action, actionContext = {}) {
      return evaluateAction(action, { ...context, ...actionContext });
    },

    requestApproval({ runId, action, payload, context: actionContext = {}, ttlMs } = {}) {
      const policy = evaluateAction(action, { ...context, ...actionContext });
      ensureAllowed(policy);
      if (!policy.requiresApproval) return null;
      if (!approvalService?.requestApproval) throw createDomainError('policy_gateway_unavailable', 'O gateway de aprovação não está disponível.');
      return approvalService.requestApproval({
        runId,
        kind: policy.kind,
        payload: approvalPayload(policy, payload),
        ...(ttlMs === undefined ? {} : { ttlMs })
      });
    },

    assertApproved({ approvalId, action, payload, context: actionContext = {} } = {}) {
      const policy = evaluateAction(action, { ...context, ...actionContext });
      ensureAllowed(policy);
      if (!policy.requiresApproval) return policy;
      if (!approvalService?.assertApproved) throw createDomainError('policy_gateway_unavailable', 'O gateway de aprovação não está disponível.');
      return approvalService.assertApproved(approvalId, approvalPayload(policy, payload));
    }
  };
}

function normalizeAction(action = {}) {
  return {
    kind: String(action.kind ?? ''),
    version: String(action.version ?? action.actionVersion ?? DEFAULT_ACTION_VERSION)
  };
}

function policyResult(action, result) {
  return { ...result, kind: action.kind, actionVersion: action.version };
}

function approvalPayload(policy, payload) {
  return {
    action: { kind: policy.kind, version: policy.actionVersion },
    payload: payload ?? {}
  };
}

function ensureAllowed(policy) {
  if (!policy.allowed && !policy.requiresApproval) throw createDomainError(policy.code, 'A política não permite esta ação.');
}
