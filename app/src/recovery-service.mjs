const BOUNDARIES = [
  'before_click',
  'after_uncertain_click',
  'after_confirmation',
  'before_evidence',
  'after_evidence',
  'before_record',
  'after_record',
  'before_count'
];

export function nextRecoveryAction(phase, observed = {}) {
  if (!BOUNDARIES.includes(phase)) return { action: 'inspect', duplicate: false };
  if (phase === 'after_uncertain_click') return { action: 'reconcile', duplicate: false, resubmit: false };
  if (phase === 'after_confirmation' || phase === 'after_evidence' || phase === 'after_record' || phase === 'before_count') {
    return { action: 'record_once', duplicate: false, inventEvidence: false, alreadyConfirmed: observed.confirmed === true };
  }
  if (phase === 'before_click') return { action: 'reopen_review', duplicate: false };
  return { action: 'inspect', duplicate: false, inventEvidence: false };
}

export function createRecoveryGuidance({ phase, message = '', pageUrl = '', runId = '' } = {}) {
  const next = nextRecoveryAction(phase);
  return {
    phase,
    runId,
    pageUrl,
    message: message || 'Há um bloqueio recuperável. Reabra a página correta, corrija ou cancele pela interface.',
    next,
    requiresManualDb: false
  };
}
