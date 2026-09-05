import test from 'node:test';
import assert from 'node:assert/strict';
import { APPLICATION_STATUS, canTransitionApplication, transitionApplication } from '../src/domain/application-status.mjs';
import { QUEUE_STATUS, canTransitionQueue } from '../src/domain/queue-status.mjs';
import { RUN_STATUS, canTransitionRun } from '../src/domain/run-status.mjs';
import { APPROVAL_STATUS, canTransitionApproval } from '../src/domain/approval-status.mjs';
import { createDomainError } from '../src/domain/errors.mjs';

const confirmation = { confirmed: true, confirmedAt: '2026-09-04T12:00:00.000Z' };
const evidence = { path: 'evidencias/confirmation.png', sha256: 'a'.repeat(64) };

test('domain application transitions submit only with visual confirmation, verified evidence and valid approval', () => {
  const allowed = canTransitionApplication(APPLICATION_STATUS.DRAFT, APPLICATION_STATUS.SUBMITTED, {
    confirmation,
    evidenceMode: 'confirmation',
    evidence,
    requireApproval: true,
    approval: { status: APPROVAL_STATUS.APPROVED, expiresAt: '2026-09-04T12:10:00.000Z', payloadHash: 'same' },
    payloadHash: 'same',
    now: new Date('2026-09-04T12:01:00.000Z')
  });

  assert.deepEqual(allowed, { allowed: true });
  assert.deepEqual(
    transitionApplication({ id: 'app-1', status: APPLICATION_STATUS.DRAFT }, APPLICATION_STATUS.SUBMITTED, {
      confirmation,
      evidenceMode: 'confirmation',
      evidence,
      requireApproval: true,
      approval: { status: APPROVAL_STATUS.APPROVED, expiresAt: '2026-09-04T12:10:00.000Z', payloadHash: 'same' },
      payloadHash: 'same',
      now: new Date('2026-09-04T12:01:00.000Z')
    }),
    { id: 'app-1', status: APPLICATION_STATUS.SUBMITTED }
  );
});

test('domain application rejects unconfirmed, unevidenced and invalidly approved submissions with stable codes', () => {
  assert.equal(
    canTransitionApplication(APPLICATION_STATUS.DRAFT, APPLICATION_STATUS.SUBMITTED, {}).reason,
    'submission_not_confirmed'
  );
  assert.equal(
    canTransitionApplication(APPLICATION_STATUS.DRAFT, APPLICATION_STATUS.SUBMITTED, { confirmation, evidenceMode: 'confirmation' }).reason,
    'evidence_required'
  );
  assert.equal(
    canTransitionApplication(APPLICATION_STATUS.DRAFT, APPLICATION_STATUS.SUBMITTED, { confirmation, evidence, requireApproval: true, approval: { status: APPROVAL_STATUS.REJECTED } }).reason,
    'approval_rejected'
  );
  assert.equal(
    canTransitionApplication(APPLICATION_STATUS.DRAFT, APPLICATION_STATUS.SUBMITTED, { confirmation, evidence, requireApproval: true, approval: { status: APPROVAL_STATUS.APPROVED, expiresAt: '2026-09-04T12:00:00.000Z' }, now: new Date('2026-09-04T12:00:01.000Z') }).reason,
    'approval_expired'
  );
  assert.equal(
    canTransitionApplication(APPLICATION_STATUS.DRAFT, APPLICATION_STATUS.SUBMITTED, { confirmation, evidence, requireApproval: true, approval: { status: APPROVAL_STATUS.APPROVED, payloadHash: 'approved' }, payloadHash: 'changed' }).reason,
    'approval_payload_changed'
  );
});

test('domain application does not reactivate terminal statuses and transitionApplication throws its reason', () => {
  const rejected = canTransitionApplication(APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.INTERVIEW, {});
  assert.deepEqual(rejected, { allowed: false, reason: 'application_terminal' });
  assert.throws(
    () => transitionApplication({ id: 'app-1', status: APPLICATION_STATUS.REJECTED }, APPLICATION_STATUS.INTERVIEW, {}),
    (error) => error.code === 'application_terminal'
  );
});

test('domain queue allows claiming only eligible queued work', () => {
  assert.deepEqual(
    canTransitionQueue(QUEUE_STATUS.QUEUED, QUEUE_STATUS.IN_PROGRESS, { targetReached: false }),
    { allowed: true }
  );
  assert.equal(
    canTransitionQueue(QUEUE_STATUS.BLOCKED, QUEUE_STATUS.IN_PROGRESS, {}).reason,
    'queue_item_blocked'
  );
  assert.equal(
    canTransitionQueue(QUEUE_STATUS.QUEUED, QUEUE_STATUS.IN_PROGRESS, { targetReached: true }).reason,
    'queue_goal_reached'
  );
});

test('domain run requires reconciliation before restarting a divergent checkpoint', () => {
  assert.deepEqual(
    canTransitionRun(RUN_STATUS.PAUSED, RUN_STATUS.RUNNING, { checkpointDiverged: false }),
    { allowed: true }
  );
  assert.equal(
    canTransitionRun(RUN_STATUS.PAUSED, RUN_STATUS.RUNNING, { checkpointDiverged: true }).reason,
    'checkpoint_reconciliation_required'
  );
  assert.equal(
    canTransitionRun(RUN_STATUS.NEEDS_RECONCILE, RUN_STATUS.RUNNING, { checkpointMatches: true }).reason,
    'checkpoint_reconciliation_required'
  );
  assert.deepEqual(
    canTransitionRun(RUN_STATUS.NEEDS_RECONCILE, RUN_STATUS.RUNNING, { checkpointMatches: true, reconciled: true }),
    { allowed: true }
  );
});

test('domain approval transitions only from pending and preserves terminal decisions', () => {
  assert.deepEqual(
    canTransitionApproval(APPROVAL_STATUS.PENDING, APPROVAL_STATUS.APPROVED),
    { allowed: true }
  );
  assert.equal(
    canTransitionApproval(APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.APPROVED).reason,
    'approval_terminal'
  );
  assert.equal(
    canTransitionApproval(APPROVAL_STATUS.EXPIRED, APPROVAL_STATUS.APPROVED).reason,
    'approval_terminal'
  );
});

test('domain errors retain a stable code and optional safe details', () => {
  const error = createDomainError('approval_required', 'A aprovação ainda não foi concedida.', { approvalId: 'approval-1' });

  assert.equal(error.name, 'DomainError');
  assert.equal(error.code, 'approval_required');
  assert.deepEqual(error.details, { approvalId: 'approval-1' });
});
