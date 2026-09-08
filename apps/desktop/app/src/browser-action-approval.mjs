export function createBrowserActionApproval({ policyGateway } = {}) {
  return {
    authorize({ runId, approvalId = '', payload } = {}) {
      if (!runId) throw domainError('browser_action_run_required', 'A ação do navegador precisa pertencer a uma execução.');
      const action = { kind: 'browser_action', version: 'v1' };
      if (approvalId) {
        policyGateway.assertApproved({ approvalId, action, payload });
        return { approved: true, approvalId };
      }
      const approval = policyGateway.requestApproval({ runId, action, payload });
      const error = domainError('approval_required', 'Esta ação do navegador exige aprovação na interface.');
      error.details = { approvalId: approval.id, approval };
      throw error;
    }
  };
}

function domainError(code, message) {
  return Object.assign(new Error(message), { code });
}
