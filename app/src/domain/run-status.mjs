export const RUN_STATUS = Object.freeze({
  RUNNING: 'running',
  PAUSED: 'paused',
  NEEDS_RECONCILE: 'needs_reconcile',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  NEEDS_ATTENTION: 'needs_attention'
});

export function canTransitionRun(from, to, context = {}) {
  if (['succeeded', 'failed', 'cancelled'].includes(from)) return denied('run_terminal');
  if (['running', 'paused', 'needs_reconcile', 'needs_attention'].includes(from) && ['succeeded', 'failed', 'cancelled', 'needs_attention'].includes(to)) return allowed();
  if (from === 'needs_attention' && ['running', 'paused'].includes(to)) return allowed();
  if (from === RUN_STATUS.RUNNING && [RUN_STATUS.PAUSED, RUN_STATUS.NEEDS_RECONCILE].includes(to)) return allowed();
  if (from === RUN_STATUS.PAUSED && to === RUN_STATUS.NEEDS_RECONCILE) return allowed();
  if (to === RUN_STATUS.RUNNING && [RUN_STATUS.PAUSED, RUN_STATUS.NEEDS_RECONCILE].includes(from)) {
    if (context.checkpointDiverged === true || context.reconciled !== true && from === RUN_STATUS.NEEDS_RECONCILE || from === RUN_STATUS.NEEDS_RECONCILE && context.checkpointMatches !== true) {
      return denied('checkpoint_reconciliation_required');
    }
    return allowed();
  }
  return denied('invalid_run_transition');
}

function allowed() {
  return { allowed: true };
}

function denied(reason) {
  return { allowed: false, reason };
}
