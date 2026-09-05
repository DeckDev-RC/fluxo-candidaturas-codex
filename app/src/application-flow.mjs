import { createPolicyGateway } from './policy.mjs';
import { createProcessManager } from './process-manager.mjs';

export function createApplicationFlow({ queueService, runService, approvalService, policyGateway: injectedPolicyGateway, browserAdapter, recordApplication, checkpointService, checkpointAfterEachAction = true, evidenceMode = '', preflightReady = async () => true }) {
  const policyGateway = injectedPolicyGateway ?? createPolicyGateway({ approvalService });
  const manager = createProcessManager({ runService });
  return {
    getPrepared(runId) { return manager.get(runId)?.prepared ?? null; },
    getWorkflow(runId) { return manager.get(runId); },
    savePrepared(runId, prepared) { return manager.save(runId, { prepared }); },
    async reconcileRun(runId) {
      const workflow = manager.get(runId);
      if (!workflow) throw domainError('application_context_missing', 'A execução não tem contexto persistido.');
      if (workflow.phase === 'submitting' || workflow.phase === 'needs_reconcile') {
        const confirmation = await browserAdapter.verifySubmission(workflow.prepared.item);
        if (!confirmation.confirmed) throw domainError('submission_needs_review', 'Não foi possível determinar o resultado do envio. Revise a plataforma manualmente.');
        manager.save(runId, { phase: 'confirmed', confirmation });
      } else if (!['confirmed', 'recorded'].includes(workflow.phase) && browserAdapter.reconcile) {
        const observed = await browserAdapter.reconcile(workflow.prepared.snapshot);
        if (!observed.matches) throw domainError('checkpoint_mismatch', 'A página atual diverge da execução salva.');
      }
      const run = runService.getRun?.(runId);
      return run?.status !== 'running' ? runService.resumeRun(runId, { reconciled: true, checkpointMatches: true }) : run;
    },
    async prepareNext({ platform = '', itemId = '', checkpoint = null, parentRunId = '' } = {}) {
      if (!(await preflightReady())) throw domainError('preflight_blocked', 'O preflight precisa estar aprovado antes de preparar uma candidatura.');
      if (checkpoint && browserAdapter.reconcile) {
        const reconciliation = await browserAdapter.reconcile(checkpoint);
        if (reconciliation.requiresReview) throw domainError('checkpoint_mismatch', 'A tela observada diverge do checkpoint; revisão manual necessária.');
      }
      const item = await queueService.claimNext({ id: itemId, platform });
      const run = runService.startRun({ kind: 'application', platform: item.platform, queueReference: item.id });
      const snapshot = browserAdapter.open ? await browserAdapter.open(item) : await browserAdapter.snapshot();
      manager.save(run.id, { phase: 'prepared', parentRunId, prepared: { item, run, snapshot } });
      runService.appendEvent({ runId: run.id, type: 'application.prepared', payload: { queueItemId: item.id, url: snapshot.url ?? '' } });
      if (checkpointAfterEachAction && checkpointService?.save) await checkpointService.save({ phase: 'aguardando aprovação', platform: item.platform, url: item.identifierOrUrl, applicationKey: item.key, notes: 'Revisão pré-envio', blocker: 'approval_required', consecutiveFailures: 0 });
      return { item, run, snapshot };
    },

    async fillConfirmed(prepared, facts = {}) {
      if (!prepared?.run?.id || typeof browserAdapter.fillConfirmed !== 'function') throw domainError('application_form_unavailable', 'O formulário observado não aceita preenchimento guiado.');
      const snapshot = await browserAdapter.fillConfirmed(facts);
      prepared.snapshot = snapshot;
      manager.save(prepared.run.id, { phase: 'prepared', prepared });
      runService.appendEvent({ runId: prepared.run.id, type: 'application.fields.filled', payload: { fields: Object.keys(facts).filter((key) => facts[key]?.confirmed === true), url: snapshot?.url ?? prepared.snapshot?.url ?? '' } });
      if (checkpointAfterEachAction && checkpointService?.save) await checkpointService.save({ phase: 'campos preenchidos', platform: prepared.item.platform, url: prepared.item.identifierOrUrl, applicationKey: prepared.item.key, notes: 'Fatos confirmados preenchidos; aguardando revisão', blocker: 'approval_required', consecutiveFailures: 0 });
      return { status: 'observed', snapshot };
    },

    requestSubmissionApproval(runId, payload) {
      const saved = manager.get(runId);
      if (saved && payload.queueItemId && payload.queueItemId !== saved.prepared.item.id) throw domainError('approval_payload_changed', 'A vaga não corresponde à execução.');
      const approval = policyGateway.requestApproval({ runId, action: { kind: 'submission', version: 'v1' }, payload, context: { requireFinalConfirmation: true } });
      if (saved) manager.save(runId, { approvalId: approval.id, approvedPayload: payload });
      return approval;
    },

    requestSensitiveDataApproval(runId, payload, context = {}) {
      return policyGateway.requestApproval({ runId, action: { kind: 'sensitive_data', version: 'v1' }, payload, context });
    },

    requestWithdrawalApproval(runId, payload) {
      return policyGateway.requestApproval({ runId, action: { kind: 'withdrawal', version: 'v1' }, payload });
    },

    async submitApproved(prepared, approvalId, payload) {
      return manager.exclusive(prepared.run.id, async () => {
      let saved = manager.get(prepared.run.id);
      if (saved?.phase === 'recorded') return saved.result;
      prepared = saved?.prepared ?? prepared;
      if (runService.assertCanSubmit) runService.assertCanSubmit(prepared.run.id);
      policyGateway.assertApproved({ approvalId, action: { kind: 'submission', version: 'v1' }, payload, context: { requireFinalConfirmation: true } });
      if (saved?.approvalId && saved.approvalId !== approvalId) throw domainError('approval_payload_changed', 'A aprovação pertence a outra revisão.');
      if (['submitting', 'needs_reconcile'].includes(saved?.phase)) throw domainError('submission_needs_review', 'Reconcilie o envio interrompido antes de continuar.');
      let confirmation = saved?.phase === 'confirmed' ? saved.confirmation : null;
      if (!confirmation) {
        if (browserAdapter.validatePrepared) await browserAdapter.validatePrepared(prepared.snapshot);
        manager.save(prepared.run.id, { phase: 'submitting', prepared, approvalId, approvedPayload: payload });
        try {
          confirmation = browserAdapter.submitWithRetry
            ? await browserAdapter.submitWithRetry('submit', { expected: prepared.item })
            : await browserAdapter.verifySubmission(prepared.item);
          if (!confirmation.confirmed) throw domainError('submission_not_confirmed', 'A plataforma não confirmou o recebimento.');
        } catch (error) {
          manager.save(prepared.run.id, { phase: 'needs_reconcile' });
          if (runService.pauseRun) runService.pauseRun(prepared.run.id, 'resultado de envio incerto');
          throw error;
        }
        manager.save(prepared.run.id, { phase: 'confirmed', confirmation });
      }
      if (!confirmation.confirmed) throw domainError('submission_not_confirmed', 'A plataforma não confirmou o recebimento.');
      const effectivePayload = { ...(saved?.effectivePayload ?? payload ?? {}) };
      if (!effectivePayload.evidencePath && browserAdapter.captureEvidence) {
        const captured = await browserAdapter.captureEvidence({ runId: prepared.run.id, item: prepared.item, confirmation });
        effectivePayload.evidencePath = typeof captured === 'string' ? captured : captured?.path;
        if (captured?.sha256) effectivePayload.evidenceSha256 = captured.sha256;
      }
      if (evidenceMode === 'confirmation' && !effectivePayload.evidencePath) throw domainError('evidence_required', 'Evidência de confirmação é obrigatória.');
      manager.save(prepared.run.id, { phase: 'confirmed', confirmation, effectivePayload });
      const application = await recordApplication({ item: prepared.item, payload: effectivePayload, evidence: confirmation.state, confirmation });
      if (runService.recordSubmission) runService.recordSubmission(prepared.run.id, application.id ?? prepared.item.key);
      const result = { application, confirmation };
      manager.save(prepared.run.id, { phase: 'recorded', result });
      runService.appendEvent({ runId: prepared.run.id, type: 'application.submission_confirmed', idempotencyKey: `confirmed-${prepared.run.id}`, payload: { applicationId: application.id, queueItemId: prepared.item.id, evidencePath: effectivePayload.evidencePath ?? '', evidenceSha256: effectivePayload.evidenceSha256 ?? '' } });
      return result;
      });
    }
  };
}

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
