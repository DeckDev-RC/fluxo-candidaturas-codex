const SECRET = /(access.?token|refresh.?token|api.?key|cookie|password|secret|credential|authorization)/i;

export function createCodexHarnessService({ request, now = () => new Date(), modelLimit = 100 } = {}) {
  if (typeof request !== 'function') throw new TypeError('Codex harness requer uma função RPC.');
  let lastSnapshot = null;

  return {
    async snapshot() {
      try {
        const accountResult = await request('account/read');
        const usage = await request('account/usage/read', null);
        const limits = await request('account/rateLimits/read', null);
        const models = await readModels();
        const snapshot = { status: 'ready', fetchedAt: now().toISOString(), account: normalizeAccount(accountResult?.account), usage: normalizeUsage(usage), rateLimits: normalizeRateLimits(limits), models };
        lastSnapshot = snapshot;
        return snapshot;
      } catch (error) {
        const failure = { status: 'unavailable', fetchedAt: now().toISOString(), error: { code: String(error?.code ?? 'codex_harness_unavailable'), message: 'Não foi possível consultar o Codex app-server.' } };
        return lastSnapshot ? { ...lastSnapshot, ...failure } : { ...failure, account: null, usage: null, rateLimits: null, models: [] };
      }
    },
    async refresh() { return this.snapshot(); }
  };

  async function readModels() {
    const models = [];
    let cursor = null;
    do {
      const result = await request('model/list', { includeHidden: false, limit: modelLimit, cursor });
      models.push(...(Array.isArray(result?.data) ? result.data.map(normalizeModel) : []));
      cursor = result?.nextCursor ?? null;
    } while (cursor && models.length < modelLimit * 10);
    return models;
  }
}

function normalizeAccount(account) { return account ? { type: String(account.type ?? ''), email: String(account.email ?? ''), planType: String(account.planType ?? '') } : null; }
function normalizeUsage(usage) { if (!usage) return null; return redact({ summary: usage.summary ?? {}, dailyUsageBuckets: Array.isArray(usage.dailyUsageBuckets) ? usage.dailyUsageBuckets : [], threadUsage: usage.threadUsage ?? null }); }
function normalizeRateLimits(result) { if (!result) return null; const limits = result.rateLimits ?? result; return redact(limits); }
function normalizeModel(model) { return { id: String(model.id ?? ''), displayName: String(model.displayName ?? model.name ?? model.id ?? ''), description: String(model.description ?? ''), efforts: Array.isArray(model.supportedReasoningEfforts) ? model.supportedReasoningEfforts.map((effort) => String(effort.reasoningEffort ?? effort.value ?? effort)).filter(Boolean) : [], defaultEffort: String(model.defaultReasoningEffort ?? ''), contextWindow: Number(model.contextWindow ?? 0) || 0 }; }
function redact(value) { if (Array.isArray(value)) return value.map(redact); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET.test(key)).map(([key, entry]) => [key, redact(entry)])); }
