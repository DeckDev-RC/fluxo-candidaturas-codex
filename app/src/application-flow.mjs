import { evaluateAction } from './policy.mjs';

export function createApplicationFlow({ queueService, runService, approvalService, browserAdapter, recordApplication, preflightReady = async () => true }) {
  return {
    async prepareNext({ platform = '' } = {}) {
      if (!(await preflightReady())) throw domainError('preflight_blocked', 'O preflight precisa estar aprovado antes de preparar uma candidatura.');
      const item = await queueService.claimNext({ platform });
      const run = runService.startRun({ kind: 'application', platform: item.platform, queueReference: item.id });
      const snapshot = await browserAdapter.snapshot();
      runService.appendEvent({ runId: run.id, type: 'application.prepared', payload: { queueItemId: item.id, url: snapshot.url ?? '' } });
      return { item, run, snapshot };
    },

    requestSubmissionApproval(runId, payload) {
      const policy = evaluateAction({ kind: 'submission' }, { requireFinalConfirmation: true });
      if (!policy.requiresApproval) return null;
      return approvalService.requestApproval({ runId, kind: 'submission', payload });
    },

    async submitApproved(prepared, approvalId, payload) {
      approvalService.assertApproved(approvalId, payload);
      const confirmation = await browserAdapter.verifySubmission();
      if (!confirmation.confirmed) throw domainError('submission_not_confirmed', 'A plataforma não confirmou o recebimento.');
      const effectivePayload = { ...(payload ?? {}) };
      if (!effectivePayload.evidencePath && browserAdapter.captureEvidence) effectivePayload.evidencePath = await browserAdapter.captureEvidence({ runId: prepared.run.id, item: prepared.item, confirmation });
      const application = await recordApplication({ item: prepared.item, payload: effectivePayload, evidence: confirmation.state, confirmation });
      runService.appendEvent({ runId: prepared.run.id, type: 'application.submission_confirmed', payload: { applicationId: application.id, queueItemId: prepared.item.id } });
      return { application, confirmation };
    }
  };
}

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
