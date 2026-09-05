const SUPPORTED_TYPES = new Set(['text', 'select', 'checkbox', 'radio', 'date', 'file', 'textarea']);

export function createFormController({ browserAdapter, lease } = {}) {
  let generation = 0;

  return {
    supportedTypes: [...SUPPORTED_TYPES],
    invalidate() { generation += 1; return generation; },

    async observe(taskId) {
      lease?.assertOwner(taskId);
      const observed = await browserAdapter.observeForm();
      return { ...observed, generation, fields: normalizeFields(observed.fields) };
    },

    async fill(taskId, fields = {}, facts = {}) {
      lease?.assertOwner(taskId);
      const current = await this.observe(taskId);
      const payload = {};
      for (const field of current.fields) {
        const fact = facts[field.name] ?? facts[field.key];
        if (!fact) continue;
        if (field.sensitive && fact.confirmed !== true) continue;
        if (!SUPPORTED_TYPES.has(field.type)) continue;
        payload[field.name] = { value: fact.value, confirmed: fact.confirmed === true };
      }
      const snapshot = await browserAdapter.fillConfirmed(payload);
      generation += 1;
      return { snapshot, generation, filled: Object.keys(payload) };
    }
  };
}

function normalizeFields(fields = []) {
  return (Array.isArray(fields) ? fields : []).map((field) => ({
    name: String(field.name ?? field.ref ?? ''),
    type: SUPPORTED_TYPES.has(field.type) ? field.type : 'text',
    sensitive: field.sensitive === true,
    required: field.required === true,
    step: Number(field.step ?? 1)
  })).filter((field) => field.name);
}
