const SENSITIVE_KEY = /(password|token|cookie|secret|mfa|authorization|credential)/i;

export function createBrowserAdapter({ driver }) {
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
      lastSnapshot = null;
    },

    async verifySubmission() {
      const state = redact(await driver.state());
      if (state?.challenge) throw manualIntervention(state.challenge);
      const text = String(state?.text ?? '').toLowerCase();
      return { confirmed: /candidatura|application/.test(text) && /enviada|submitted|recebida|received/.test(text), state };
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
