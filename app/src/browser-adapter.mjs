import { access } from 'node:fs/promises';
import { join } from 'node:path';

const SENSITIVE_KEY = /(password|token|cookie|secret|mfa|authorization|credential)/i;

export function createBrowserAdapter({ driver, evidenceRoot = '' }) {
  let lastSnapshot = null;

  return {
    async snapshot() {
      const state = await driver.snapshot();
      if (state?.challenge) throw manualIntervention(state.challenge);
      lastSnapshot = redact(state);
      return lastSnapshot;
    },

    async fill(field, value) {
      if (!lastSnapshot) throw domainError('snapshot_required', 'Capture um snapshot antes de preencher.');
      await driver.fill(field, value);
      const state = await driver.snapshot();
      if (state?.challenge) throw manualIntervention(state.challenge);
      lastSnapshot = redact(state);
    },

    async observeForm() {
      const observed = await this.snapshot();
      return { ...observed, fields: observed?.dom?.fields ?? observed?.fields ?? [], visual: observed?.screenshot ?? observed?.visual ?? null };
    },

    async fillConfirmed(facts = {}) {
      const knownFields = new Set(lastSnapshot?.dom?.fields ?? lastSnapshot?.fields ?? Object.keys(facts));
      for (const [field, fact] of Object.entries(facts)) {
        if (fact?.confirmed !== true || !knownFields.has(field)) continue;
        await this.fill(field, fact.value);
      }
      return lastSnapshot;
    },

    async submitWithRetry(ref, { maxAttempts = 2 } = {}) {
      if (!lastSnapshot) await this.snapshot();
      for (let attempt = 1; attempt <= Math.max(1, Number(maxAttempts) || 1); attempt += 1) {
        const before = await this.verifySubmission();
        if (before.confirmed) return { ...before, attempts: attempt - 1 };
        try { await driver.click(ref); } catch (error) { if (error?.retryable !== true || attempt >= maxAttempts) throw error; continue; }
        const confirmation = await this.verifySubmission();
        if (confirmation.confirmed) return { ...confirmation, attempts: attempt };
      }
      throw domainError('submission_not_confirmed', 'A plataforma não confirmou o recebimento após as tentativas permitidas.');
    },

    async verifySubmission() {
      const state = redact(await driver.state());
      if (state?.challenge) throw manualIntervention(state.challenge);
      const text = String(state?.text ?? '').toLowerCase();
      return { confirmed: /candidatura|application/.test(text) && /enviada|submitted|recebida|received/.test(text), state };
    },

    async captureEvidence({ runId = 'run' } = {}) {
      const safeId = String(runId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const path = `evidencias/${safeId}-confirmacao.png`;
      if (typeof driver.screenshot !== 'function') throw domainError('evidence_capture_unavailable', 'O driver não oferece captura de evidência.');
      const result = await driver.screenshot(path);
      if (result?.ok === false || result?.exitCode != null && result.exitCode !== 0) throw domainError('evidence_capture_failed', 'Não foi possível capturar a evidência.');
      if (evidenceRoot) { try { await access(join(evidenceRoot, path)); } catch { throw domainError('evidence_capture_missing', 'A captura não produziu um arquivo verificável.'); } }
      return path;
    },

    async reconcile(checkpoint = {}) {
      const state = redact(await driver.state());
      if (state?.challenge) throw manualIntervention(state.challenge);
      const differences = [];
      for (const field of ['url', 'page']) if (checkpoint[field] && (field !== 'url' || /^https?:\/\//i.test(String(checkpoint[field]))) && state[field] !== checkpoint[field]) differences.push({ field, expected: checkpoint[field], observed: state[field] ?? '' });
      return { matches: differences.length === 0, requiresReview: differences.length > 0, differences, state };
    }
  };
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SENSITIVE_KEY.test(key)).map(([key, entry]) => [key, redact(entry)]));
}

function manualIntervention(challenge) {
  return domainError('manual_intervention_required', `Intervenção manual necessária: ${challenge}`);
}

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
