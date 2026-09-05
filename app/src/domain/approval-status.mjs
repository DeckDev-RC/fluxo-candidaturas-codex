export const APPROVAL_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
});

const TERMINAL_STATUSES = new Set([APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.EXPIRED]);
const DECISIONS = new Set([APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.EXPIRED]);

export function canTransitionApproval(from, to) {
  if (TERMINAL_STATUSES.has(from)) return denied('approval_terminal');
  if (from === APPROVAL_STATUS.PENDING && DECISIONS.has(to)) return allowed();
  if (from === APPROVAL_STATUS.APPROVED && to === APPROVAL_STATUS.EXPIRED) return allowed();
  return denied('invalid_approval_transition');
}

function allowed() {
  return { allowed: true };
}

function denied(reason) {
  return { allowed: false, reason };
}
