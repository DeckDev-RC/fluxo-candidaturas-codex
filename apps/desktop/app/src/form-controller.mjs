const SUPPORTED_TYPES = new Set(['text', 'select', 'checkbox', 'radio', 'date', 'file', 'textarea']);

// Variações de campo de texto do HTML tratadas como texto. Qualquer outro tipo
// permanece como veio e é ignorado no preenchimento: controle não anunciado não
// é preenchido às cegas.
const EQUIVALENTES_A_TEXTO = new Set(['email', 'tel', 'number', 'url', 'search', 'input', 'select-one', 'select-multiple']);

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
        // O fato pode estar sob a referência do controle ou sob o nome do campo.
        const fact = facts[field.ref] ?? facts[field.name] ?? facts[field.key];
        if (!fact) continue;
        if (field.sensitive && fact.confirmed !== true) continue;
        if (!SUPPORTED_TYPES.has(field.type)) continue;
        payload[field.ref || field.name] = { value: fact.value, confirmed: fact.confirmed === true };
      }
      const snapshot = await browserAdapter.fillConfirmed(payload);
      generation += 1;
      return { snapshot, generation, filled: Object.keys(payload) };
    }
  };
}

// O observador pode devolver só a referência do controle (texto) ou o detalhe
// completo com tipo e rótulo. Os dois formatos viram o mesmo campo normalizado.
function normalizeFields(fields = []) {
  return (Array.isArray(fields) ? fields : []).map((field) => {
    const detalhe = typeof field === 'string' ? { ref: field } : field ?? {};
    const ref = String(detalhe.ref ?? detalhe.name ?? '');
    const tipo = String(detalhe.type ?? 'text');
    return {
      ref,
      name: String(detalhe.name || ref),
      label: String(detalhe.label ?? ''),
      type: SUPPORTED_TYPES.has(tipo) ? tipo : EQUIVALENTES_A_TEXTO.has(tipo) ? equivalente(tipo) : tipo,
      sensitive: detalhe.sensitive === true || /senha|password|cpf|token/i.test(`${detalhe.name ?? ''} ${detalhe.label ?? ''}`),
      required: detalhe.required === true,
      step: Number(detalhe.step ?? 1)
    };
  }).filter((field) => field.ref);
}

function equivalente(tipo) {
  return tipo.startsWith('select') ? 'select' : 'text';
}
