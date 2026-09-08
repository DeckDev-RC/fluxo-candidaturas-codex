const RETRYABLE = new Set([
  'platform_unavailable',
  'network_error',
  'timeout',
  'followup_page_unsupported'
]);

const NOT_RETRYABLE = new Set([
  'approval_required',
  'approval_decision_forbidden',
  'manual_intervention_required',
  'submission_not_confirmed',
  'submission_needs_review',
  'unconfirmed_profile_fact',
  'campaign_cancelled',
  'run_application_limit_reached',
  'consecutive_failures_limit',
  'unsupported_page',
  'checkpoint_mismatch',
  'approval_payload_changed'
]);

export function classifyError(error = {}) {
  const code = String(error.code ?? '');
  if (code === 'submission_not_confirmed' || code === 'submission_needs_review') {
    return { action: 'reconcile', retryable: false, code, message: error.message };
  }
  if (NOT_RETRYABLE.has(code) || error.retryable === false) {
    return { action: 'intervene', retryable: false, code, message: error.message };
  }
  if (RETRYABLE.has(code) || error.retryable === true) {
    return { action: 'retry', retryable: true, code, message: error.message };
  }
  return { action: 'intervene', retryable: false, code: code || 'unclassified', message: error.message };
}
