import { createPolicyGateway } from './policy.mjs';

export function createApplicationFlow({ queueService, runService, approvalService, policyGateway: injectedPolicyGateway, browserAdapter, recordApplication, checkpointService, checkpointAfterEachAction = true, evidenceMode = '', preflightReady = async () => true }) {
  const policyGateway = injectedPolicyGateway ?? createPolicyGateway({ approvalService });
  return {
    async prepareNext({ platform = '', checkpoint = null } = {}) {
      if (!(await preflightReady())) throw domainError('preflight_blocked', 'O preflight precisa estar aprovado antes de preparar uma candidatura.');
      if (checkpoint && browserAdapter.reconcile) {
        const reconciliation = await browserAdapter.reconcile(checkpoint);
        if (reconciliation.requiresReview) throw domainError('checkpoint_mismatch', 'A tela observada diverge do checkpoint; revisão manual necessária.');
      }
      const item = await queueService.claimNext({ platform });
      const run = runService.startRun({ kind: 'application', platform: item.platform, queueReference: item.id });
      const snapshot = await browserAdapter.snapshot();
      runService.appendEvent({ runId: run.id, type: 'application.prepared', payload: { queueItemId: item.id, url: snapshot.url ?? '' } });
      if (checkpointAfterEachAction && checkpointService?.save) await checkpointService.save({ phase: 'aguardando aprovação', platform: item.platform, url: item.identifierOrUrl, applicationKey: item.key, notes: 'Revisão pré-envio', blocker: 'approval_required', consecutiveFailures: 0 });
      return { item, run, snapshot };
    },

    requestSubmissionApproval(runId, payload) {
      return policyGateway.requestApproval({ runId, action: { kind: 'submission', version: 'v1' }, payload, context: { requireFinalConfirmation: true } });
    },

    requestSensitiveDataApproval(runId, payload, context = {}) {
      return policyGateway.requestApproval({ runId, action: { kind: 'sensitive_data', version: 'v1' }, payload, context });
    },

    requestWithdrawalApproval(runId, payload) {
      return policyGateway.requestApproval({ runId, action: { kind: 'withdrawal', version: 'v1' }, payload });
    },

    async submitApproved(prepared, approvalId, payload) {
      if (runService.assertCanSubmit) runService.assertCanSubmit(prepared.run.id);
      policyGateway.assertApproved({ approvalId, action: { kind: 'submission', version: 'v1' }, payload, context: { requireFinalConfirmation: true } });
      const confirmation = await browserAdapter.verifySubmission();
      if (!confirmation.confirmed) throw domainError('submission_not_confirmed', 'A plataforma não confirmou o recebimento.');
      const effectivePayload = { ...(payload ?? {}) };
      if (!effectivePayload.evidencePath && browserAdapter.captureEvidence) {
        const captured = await browserAdapter.captureEvidence({ runId: prepared.run.id, item: prepared.item, confirmation });
        effectivePayload.evidencePath = typeof captured === 'string' ? captured : captured?.path;
        if (captured?.sha256) effectivePayload.evidenceSha256 = captured.sha256;
      }
      if (evidenceMode === 'confirmation' && !effectivePayload.evidencePath) throw domainError('evidence_required', 'Evidência de confirmação é obrigatória.');
      const application = await recordApplication({ item: prepared.item, payload: effectivePayload, evidence: confirmation.state, confirmation });
      if (runService.recordSubmission) runService.recordSubmission(prepared.run.id);
      runService.appendEvent({ runId: prepared.run.id, type: 'application.submission_confirmed', payload: { applicationId: application.id, queueItemId: prepared.item.id, evidencePath: effectivePayload.evidencePath ?? '', evidenceSha256: effectivePayload.evidenceSha256 ?? '' } });
      return { application, confirmation };
    }
  };
}

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
