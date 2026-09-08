import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserActionApproval } from '../src/browser-action-approval.mjs';
import { evaluateAction } from '../src/policy.mjs';

test('ação externa do navegador sempre exige aprovação humana vinculada', () => {
  const requests = [];
  const assertions = [];
  const service = createBrowserActionApproval({
    policyGateway: {
      requestApproval(input) { requests.push(input); return { id: 'approval-browser-1' }; },
      assertApproved(input) { assertions.push(input); return { approved: true }; }
    }
  });
  const payload = {
    platform: 'LINKEDIN',
    page: { url: 'https://linkedin.com/feed', fingerprint: 'abc' },
    action: { type: 'click', element: 'Enviar' }
  };

  assert.throws(
    () => service.authorize({ runId: 'run-1', payload }),
    (error) => error.code === 'approval_required' && error.details.approvalId === 'approval-browser-1'
  );
  assert.equal(requests[0].action.kind, 'browser_action');
  assert.equal(evaluateAction({ kind: 'browser_action' }, { requireFinalConfirmation: false, allowAutomatedSubmission: true }).requiresApproval, true);

  assert.deepEqual(service.authorize({ runId: 'run-1', approvalId: 'approval-browser-1', payload }), { approved: true, approvalId: 'approval-browser-1' });
  assert.equal(assertions[0].approvalId, 'approval-browser-1');
  assert.deepEqual(assertions[0].payload, payload);
});
