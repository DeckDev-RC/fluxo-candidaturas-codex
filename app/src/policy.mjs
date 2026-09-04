const APPROVAL_KINDS = new Set(['submission', 'timed_test', 'message', 'profile_change']);

export function evaluateAction(action = {}, context = {}) {
  if (['captcha', 'mfa', 'biometric'].includes(context.browserChallenge)) {
    return { allowed: false, requiresApproval: false, code: 'manual_intervention_required' };
  }
  if (action.kind === 'sensitive_data' && context.sensitiveConfirmed !== true) {
    return { allowed: false, requiresApproval: false, code: 'sensitive_confirmation_required' };
  }

  const requiresApproval = APPROVAL_KINDS.has(action.kind)
    && (context.requireFinalConfirmation !== false || action.kind !== 'submission' || context.allowAutomatedSubmission !== true);
  return {
    allowed: !requiresApproval,
    requiresApproval,
    code: requiresApproval ? 'approval_required' : 'allowed'
  };
}
