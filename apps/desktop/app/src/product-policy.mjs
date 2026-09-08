export const PRODUCT_POLICY = {
  requireFinalConfirmation: true,
  allowAutomatedSubmission: false,
  campaignAuthorizationNeverSkipsSensitive: true,
  agentCannotApprove: true,
  recruiterMessageMode: 'draft-only',
  backgroundWhenClosed: false,
  ocrSupported: false
};

export const EXTERNAL_ACTIONS = {
  search: { decider: 'system', pauseOn: ['unsupported_page', 'captcha', 'session_expired'] },
  fill_confirmed: { decider: 'system', pauseOn: ['gap', 'conflict', 'sensitive_field'] },
  fill_sensitive: { decider: 'user', pauseOn: ['always'] },
  submit: { decider: 'user', pauseOn: ['always'] },
  recruiter_message: { decider: 'user', pauseOn: ['always'] },
  browser_action: { decider: 'user', pauseOn: ['always'] },
  timed_test: { decider: 'user', pauseOn: ['always'] },
  challenge: { decider: 'user', pauseOn: ['always'] }
};

export function assertHumanDecision(actor) {
  if (actor?.type === 'agent' || actor?.actorType === 'agent') {
    const error = new Error('Agentes não podem decidir ações externas sensíveis.');
    error.code = 'approval_decision_forbidden';
    throw error;
  }
}

export function campaignLimitsFrom(config = {}) {
  return {
    maxApplicationsPerRun: Number(config.maxApplicationsPerRun ?? 30),
    maxConsecutiveFailures: Number(config.maxConsecutiveFailures ?? 3),
    maxTaskAttempts: Number(config.maxTaskAttempts ?? 2),
    maxRunDurationMs: Number(config.maxRunDurationMs ?? 4 * 60 * 60 * 1000),
    maxRunTokens: Number(config.maxRunTokens ?? 200000),
    followUpMinIntervalMs: Number(config.followUpMinIntervalMs ?? 30 * 60 * 1000)
  };
}
