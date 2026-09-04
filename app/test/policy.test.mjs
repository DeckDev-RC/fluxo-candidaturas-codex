import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAction } from '../src/policy.mjs';

test('policy requires approval before submission', () => {
  const result = evaluateAction({ kind: 'submission' }, { requireFinalConfirmation: true });

  assert.equal(result.allowed, false);
  assert.equal(result.requiresApproval, true);
  assert.equal(result.code, 'approval_required');
});

test('policy blocks browser challenges and unconfirmed sensitive answers', () => {
  const captcha = evaluateAction({ kind: 'submission' }, { browserChallenge: 'captcha' });
  const sensitive = evaluateAction({ kind: 'sensitive_data' }, { sensitiveConfirmed: false });

  assert.equal(captcha.code, 'manual_intervention_required');
  assert.equal(sensitive.code, 'sensitive_confirmation_required');
});

test('policy requires approval for timed tests and recruiter messages', () => {
  const timedTest = evaluateAction({ kind: 'timed_test' }, {});
  const message = evaluateAction({ kind: 'message' }, {});

  assert.equal(timedTest.requiresApproval, true);
  assert.equal(message.requiresApproval, true);
});
