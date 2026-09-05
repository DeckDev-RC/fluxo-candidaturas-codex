export const RUN_STATUS = Object.freeze({
  RUNNING: 'running',
  PAUSED: 'paused',
  NEEDS_RECONCILE: 'needs_reconcile'
});

export function canTransitionRun(from, to, context = {}) {
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
