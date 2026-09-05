import { APPROVAL_STATUS } from './approval-status.mjs';
import { createDomainError } from './errors.mjs';

export const APPLICATION_STATUS = Object.freeze({
  DRAFT: 'rascunho',
  SUBMITTED: 'enviada',
  SCREENING: 'triagem',
  TEST_PENDING: 'teste pendente',
  TEST_COMPLETED: 'teste concluído',
  INTERVIEW: 'entrevista',
  OFFER: 'proposta',
  REJECTED: 'rejeitada',
  CLOSED: 'encerrada'
});

const TERMINAL_STATUSES = new Set([APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.CLOSED]);
const ACTIVE_STATUSES = new Set([
  APPLICATION_STATUS.DRAFT,
  APPLICATION_STATUS.SUBMITTED,
  APPLICATION_STATUS.SCREENING,
  APPLICATION_STATUS.TEST_PENDING,
  APPLICATION_STATUS.TEST_COMPLETED,
  APPLICATION_STATUS.INTERVIEW,
  APPLICATION_STATUS.OFFER
]);
const TRANSITIONS = new Map([
  [APPLICATION_STATUS.DRAFT, new Set([APPLICATION_STATUS.SUBMITTED])],
  [APPLICATION_STATUS.SUBMITTED, new Set([APPLICATION_STATUS.SCREENING, APPLICATION_STATUS.TEST_PENDING, APPLICATION_STATUS.INTERVIEW, APPLICATION_STATUS.OFFER, APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.CLOSED])],
  [APPLICATION_STATUS.SCREENING, new Set([APPLICATION_STATUS.TEST_PENDING, APPLICATION_STATUS.INTERVIEW, APPLICATION_STATUS.OFFER, APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.CLOSED])],
  [APPLICATION_STATUS.TEST_PENDING, new Set([APPLICATION_STATUS.TEST_COMPLETED, APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.CLOSED])],
  [APPLICATION_STATUS.TEST_COMPLETED, new Set([APPLICATION_STATUS.INTERVIEW, APPLICATION_STATUS.OFFER, APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.CLOSED])],
  [APPLICATION_STATUS.INTERVIEW, new Set([APPLICATION_STATUS.OFFER, APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.CLOSED])],
  [APPLICATION_STATUS.OFFER, new Set([APPLICATION_STATUS.CLOSED])]
]);

export function canTransitionApplication(from, to, context = {}) {
  if (TERMINAL_STATUSES.has(from) && ACTIVE_STATUSES.has(to)) return denied('application_terminal');
  if (!TRANSITIONS.get(from)?.has(to)) return denied('invalid_application_transition');
  if (to !== APPLICATION_STATUS.SUBMITTED) return allowed();

  const confirmation = context.confirmation;
  if (confirmation?.confirmed !== true) return denied('submission_not_confirmed');
  if (!hasTimestamp(confirmation)) return denied('submission_confirmation_timestamp_required');
  if (requiresConfirmationEvidence(context) && !hasVerifiableEvidence(context)) return denied('evidence_required');
  return approvalDecision(context);
}

export function transitionApplication(application, to, context = {}) {
  const result = canTransitionApplication(application?.status, to, context);
  if (!result.allowed) throw createDomainError(result.reason, 'Transição de candidatura não permitida.', { from: application?.status, to });
  return { ...application, status: to };
}

function approvalDecision(context) {
  if (!requiresApproval(context)) return allowed();
  const approval = context.approval;
  if (!approval) return denied('approval_required');
  if (approval.status === APPROVAL_STATUS.REJECTED) return denied('approval_rejected');
  if (approval.status === APPROVAL_STATUS.EXPIRED || isExpired(approval.expiresAt, context.now)) return denied('approval_expired');
  if (approval.status !== APPROVAL_STATUS.APPROVED) return denied('approval_required');
  if (approval.payloadChanged === true || approval.payloadHash && context.payloadHash && approval.payloadHash !== context.payloadHash) return denied('approval_payload_changed');
  return allowed();
}

function requiresApproval(context) {
  return context.requireApproval === true || context.requireFinalConfirmation === true || context.policy?.requiresApproval === true;
}

function requiresConfirmationEvidence(context) {
  return context.evidenceMode === 'confirmation' || context.EVIDENCE_MODE === 'confirmation' || context.environment?.EVIDENCE_MODE === 'confirmation';
}

function hasTimestamp(confirmation) {
  return Boolean(confirmation.confirmedAt || confirmation.timestamp || confirmation.submittedAt);
}

function hasVerifiableEvidence(context) {
  const evidence = context.evidence ?? {};
  const path = evidence.path ?? context.evidencePath;
  const sha256 = evidence.sha256 ?? context.evidenceSha256;
  return Boolean(String(path ?? '').trim() && /^[a-f0-9]{64}$/i.test(String(sha256 ?? '')));
}

function isExpired(expiresAt, now) {
  if (!expiresAt) return false;
  const expiry = Date.parse(expiresAt);
  const current = now instanceof Date ? now.getTime() : Date.now();
  return Number.isFinite(expiry) && expiry <= current;
}

function allowed() {
  return { allowed: true };
}

function denied(reason) {
  return { allowed: false, reason };
}
