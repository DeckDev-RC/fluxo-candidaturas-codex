import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovalService } from '../src/approval-service.mjs';
import { createAssessmentService } from '../src/assessment-service.mjs';
import { createMessageService } from '../src/message-service.mjs';
import { createPolicyGateway, evaluateAction } from '../src/policy.mjs';

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

test('policy differentiates every approval-gated action with a versioned action contract', () => {
  const actions = [
    ['submission', {}],
    ['sensitive_data', { sensitiveConfirmed: true }],
    ['timed_test', {}],
    ['message', {}],
    ['withdrawal', {}]
  ];

  for (const [kind, context] of actions) {
    const result = evaluateAction({ kind }, context);
    assert.equal(result.requiresApproval, true, kind);
    assert.match(result.actionVersion, /^v\d+$/);
  }
});

test('policy gateway binds approval to its action version and full payload, while only a user can decide', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-policy-gateway-'));
  const approvalService = createApprovalService({ dbPath: join(root, 'harness.sqlite') });
  const gateway = createPolicyGateway({ approvalService });
  const action = { kind: 'message', version: 'v2' };
  const payload = { recipient: { name: 'Pessoa Teste', channel: 'LinkedIn' }, text: 'Olá, Pessoa Teste.' };

  try {
    const approval = gateway.requestApproval({ runId: 'run-1', action, payload });
    assert.deepEqual(approval.payloadSummary, { action, payload });

    assert.throws(
      () => approvalService.decideApproval(approval.id, { decision: 'approved', reason: 'agent-approved' }, { actorId: 'agent-1', actorType: 'agent' }),
      (error) => error.code === 'approval_decision_forbidden'
    );

    const decided = approvalService.decideApproval(approval.id, { decision: 'approved', reason: 'Mensagem revisada pela candidata.' }, { actorId: 'candidate', actorType: 'user' });
    assert.equal(decided.decisionReason, 'Mensagem revisada pela candidata.');
    assert.equal(decided.decidedBy, 'candidate');
    assert.ok(decided.decidedAt);

    assert.doesNotThrow(() => gateway.assertApproved({ approvalId: approval.id, action, payload }));
    assert.throws(
      () => gateway.assertApproved({ approvalId: approval.id, action, payload: { ...payload, text: 'Texto alterado.' } }),
      (error) => error.code === 'approval_payload_changed'
    );
    assert.throws(
      () => gateway.assertApproved({ approvalId: approval.id, action: { ...action, version: 'v3' }, payload }),
      (error) => error.code === 'approval_payload_changed'
    );
    assert.equal(typeof gateway.decideApproval, 'undefined');
  } finally {
    approvalService.close();
  }
});

test('timed-test and message services request and validate approvals through the policy gateway', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-policy-services-'));
  const approvalService = createApprovalService({ dbPath: join(root, 'harness.sqlite') });
  const policyGateway = createPolicyGateway({ approvalService });
  const assessmentService = createAssessmentService({ policyGateway });
  const messageService = createMessageService({ policyGateway });

  try {
    const timedTest = assessmentService.requestTimedTestApproval({ runId: 'run-1', payload: { name: 'Lógica', durationSeconds: 900 } });
    const message = messageService.requestSendApproval({ runId: 'run-2', payload: { recipient: 'Pessoa Teste', text: 'Olá, Pessoa Teste.' } });
    assert.equal(timedTest.kind, 'timed_test');
    assert.equal(message.kind, 'message');

    approvalService.decideApproval(timedTest.id, { decision: 'approved', reason: 'Teste iniciado pela candidata.' }, { actorId: 'candidate', actorType: 'user' });
    approvalService.decideApproval(message.id, { decision: 'approved', reason: 'Mensagem revisada pela candidata.' }, { actorId: 'candidate', actorType: 'user' });
    assert.doesNotThrow(() => assessmentService.assertTimedTestApproved({ approvalId: timedTest.id, payload: { name: 'Lógica', durationSeconds: 900 } }));
    assert.doesNotThrow(() => messageService.assertSendApproved({ approvalId: message.id, payload: { recipient: 'Pessoa Teste', text: 'Olá, Pessoa Teste.' } }));
  } finally {
    approvalService.close();
  }
});
