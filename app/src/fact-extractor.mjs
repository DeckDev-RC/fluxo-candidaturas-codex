const LABELED = {
  name: /(?:nome(?: completo)?|name)\s*:\s*(.+)/i,
  email: /(?:e-?mail)\s*:\s*([^\s]+@[^\s]+)/i,
  phone: /(?:telefone|celular|whatsapp|phone)\s*:\s*([+\d().\s-]{3,})/i,
  targetRoles: /(?:cargo(?:s)?-alvo|objetivo(?: profissional)?|target roles?)\s*:\s*(.+)/i,
  seniority: /senioridade\s*:\s*(.+)/i,
  location: /(?:localiza(?:ção|cao)|local)\s*:\s*(.+)/i,
  education: /(?:forma(?:ção|cao)|educa(?:ção|cao))\s*:\s*(.+)/i,
  languages: /idiomas?\s*:\s*(.+)/i,
  workModes: /(?:modalidade|modelo de trabalho)\s*:\s*(.+)/i,
  skills: /(?:competências|competencias|skills)\s*:\s*(.+)/i,
  contracts: /(?:contrato|regime)\s*:\s*(.+)/i,
  minimumSalary: /(?:salário|salario|pretensão|pretensao)\s*:\s*(.+)/i
};

const INFERRED = {
  email: /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  phone: /(?:\+55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\d{4}|\d{4})[-\s]?\d{4}/
};

const LIST_KEYS = new Set(['skills', 'languages', 'workModes', 'contracts']);

export function extractStructuredFacts({ text = '', source = 'currículo', now = () => new Date() } = {}) {
  const facts = {};
  const conflicts = [];
  const inferences = [];
  const body = String(text ?? '');
  const extractedAt = now().toISOString();

  for (const [key, pattern] of Object.entries(LABELED)) {
    const match = body.match(pattern);
    if (!match) continue;
    facts[key] = fact(key, normalize(key, match[1]), source, extractedAt, true, 'labeled');
  }

  for (const [key, pattern] of Object.entries(INFERRED)) {
    if (facts[key]) continue;
    const match = body.match(pattern);
    if (!match) continue;
    const inferred = fact(key, normalize(key, match[0]), source, extractedAt, false, 'inferred');
    inferences.push(inferred);
    facts[key] = inferred;
  }

  return { facts, inferences, conflicts, extractedAt, source };
}

export function mergeFacts(existing = {}, incoming = {}, { extractedAt = new Date().toISOString() } = {}) {
  const facts = { ...existing };
  const conflicts = [];
  for (const [key, next] of Object.entries(incoming)) {
    const previous = facts[key];
    if (previous && stringify(previous.value) !== stringify(next.value) && previous.confirmed && next.confirmed) {
      conflicts.push({ key, previous: previous.value, incoming: next.value, extractedAt });
      facts[key] = { ...previous, conflict: { incoming: next.value, extractedAt }, confirmed: true };
      continue;
    }
    if (previous?.confirmed && !next.confirmed) continue;
    facts[key] = next;
  }
  return { facts, conflicts };
}

function fact(key, value, source, extractedAt, confirmed, kind) {
  return {
    key,
    value,
    source,
    sourceLabel: kind === 'inferred' ? `Inferência de ${source}` : source,
    extractedAt,
    confirmed,
    kind
  };
}

function normalize(key, value) {
  const text = String(value ?? '').trim();
  return LIST_KEYS.has(key) ? text.split(/,|;|\s+e\s+/i).map((item) => item.trim()).filter(Boolean) : text;
}

function stringify(value) {
  return JSON.stringify(value);
}
