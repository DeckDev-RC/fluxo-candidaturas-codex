import { APPROVAL_STATUS } from './approval-status.mjs';
import { createDomainError } from './errors.mjs';

export const APPLICATION_STATUS = Object.freeze({
  DRAFT: 'rascunho',
  READY_FOR_REVIEW: 'pronta para revisão',
  SUBMITTED: 'enviada',
  SCREENING: 'triagem',
  TEST_PENDING: 'teste pendente',
  TEST_COMPLETED: 'teste concluído',
  INTERVIEW: 'entrevista',
  OFFER: 'proposta',
  REJECTED: 'rejeitada',
  WITHDRAWN: 'desistência',
  CLOSED: 'encerrada'
});

const TERMINAL_STATUSES = new Set([APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.WITHDRAWN, APPLICATION_STATUS.CLOSED]);
const OUTCOME_STATUSES = [APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.WITHDRAWN, APPLICATION_STATUS.CLOSED];
const ACTIVE_STATUSES = new Set([
  APPLICATION_STATUS.DRAFT,
  APPLICATION_STATUS.READY_FOR_REVIEW,
  APPLICATION_STATUS.SUBMITTED,
  APPLICATION_STATUS.SCREENING,
  APPLICATION_STATUS.TEST_PENDING,
  APPLICATION_STATUS.TEST_COMPLETED,
  APPLICATION_STATUS.INTERVIEW,
  APPLICATION_STATUS.OFFER
]);
const TRANSITIONS = new Map([
  [APPLICATION_STATUS.DRAFT, new Set([APPLICATION_STATUS.READY_FOR_REVIEW, APPLICATION_STATUS.SUBMITTED, APPLICATION_STATUS.WITHDRAWN])],
  [APPLICATION_STATUS.READY_FOR_REVIEW, new Set([APPLICATION_STATUS.SUBMITTED, ...OUTCOME_STATUSES])],
  [APPLICATION_STATUS.SUBMITTED, new Set([APPLICATION_STATUS.SCREENING, APPLICATION_STATUS.TEST_PENDING, APPLICATION_STATUS.INTERVIEW, APPLICATION_STATUS.OFFER, ...OUTCOME_STATUSES])],
  [APPLICATION_STATUS.SCREENING, new Set([APPLICATION_STATUS.TEST_PENDING, APPLICATION_STATUS.INTERVIEW, APPLICATION_STATUS.OFFER, ...OUTCOME_STATUSES])],
  [APPLICATION_STATUS.TEST_PENDING, new Set([APPLICATION_STATUS.TEST_COMPLETED, ...OUTCOME_STATUSES])],
  [APPLICATION_STATUS.TEST_COMPLETED, new Set([APPLICATION_STATUS.INTERVIEW, APPLICATION_STATUS.OFFER, ...OUTCOME_STATUSES])],
  [APPLICATION_STATUS.INTERVIEW, new Set([APPLICATION_STATUS.OFFER, ...OUTCOME_STATUSES])],
  [APPLICATION_STATUS.OFFER, new Set([APPLICATION_STATUS.CLOSED, APPLICATION_STATUS.WITHDRAWN])]
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
  if (approval.payloadChanged === true || !isSha256(approval.payloadHash) || !isSha256(context.payloadHash) || approval.payloadHash !== context.payloadHash) return denied('approval_payload_changed');
  return allowed();
}

function requiresApproval(context) {
  return context.requireApproval === true || context.requireFinalConfirmation === true || context.policy?.requiresApproval === true;
}

function requiresConfirmationEvidence(context) {
  return context.evidenceMode === 'confirmation' || context.EVIDENCE_MODE === 'confirmation' || context.environment?.EVIDENCE_MODE === 'confirmation';
}

function hasTimestamp(confirmation) {
  const timestamp = confirmation.confirmedAt ?? confirmation.timestamp ?? confirmation.submittedAt;
  return timestamp instanceof Date
    ? Number.isFinite(timestamp.getTime())
    : typeof timestamp === 'string' && Boolean(timestamp.trim()) && Number.isFinite(Date.parse(timestamp));
}

function hasVerifiableEvidence(context) {
  const evidence = context.evidence ?? {};
  const path = evidence.path ?? context.evidencePath;
  const sha256 = evidence.sha256 ?? context.evidenceSha256;
  return Boolean(String(path ?? '').trim() && isSha256(sha256));
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value ?? ''));
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
