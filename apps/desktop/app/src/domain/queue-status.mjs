export const QUEUE_STATUS = Object.freeze({
  QUEUED: 'na fila',
  IN_PROGRESS: 'em andamento',
  PROCESSED: 'processada',
  BLOCKED: 'bloqueada',
  // Descartada pela pessoa (ou pela IA a pedido dela): sai da fila ativa, mas fica
  // registrada para a busca não a trazer de volta como novidade.
  DISCARDED: 'descartada'
});

const TERMINAL_STATUSES = new Set([QUEUE_STATUS.PROCESSED, QUEUE_STATUS.BLOCKED, QUEUE_STATUS.DISCARDED]);

export function canTransitionQueue(from, to, context = {}) {
  if (from === QUEUE_STATUS.BLOCKED && to === QUEUE_STATUS.IN_PROGRESS) return denied('queue_item_blocked');
  if (TERMINAL_STATUSES.has(from)) return denied('queue_terminal');
  if (to === QUEUE_STATUS.DISCARDED && [QUEUE_STATUS.QUEUED, QUEUE_STATUS.IN_PROGRESS].includes(from)) return allowed();
  if (from === QUEUE_STATUS.QUEUED && to === QUEUE_STATUS.IN_PROGRESS) {
    if (context.targetReached === true || context.targetEligible === false || context.campaignTargetMet === true) {
      return denied('queue_goal_reached');
    }
    return allowed();
  }
  if (from === QUEUE_STATUS.IN_PROGRESS && [QUEUE_STATUS.QUEUED, QUEUE_STATUS.PROCESSED, QUEUE_STATUS.BLOCKED].includes(to)) return allowed();
  return denied('invalid_queue_transition');
}

function allowed() {
  return { allowed: true };
}

function denied(reason) {
  return { allowed: false, reason };
}
