import { createMemoryService } from './memory-service.mjs';
import { extractStructuredFacts, mergeFacts } from './fact-extractor.mjs';

const REQUIRED_FOR_FIRST_SEARCH = ['name', 'email', 'phone', 'location', 'targetRoles'];

export function createIntakeService({ rootDir = '', memoryService = createMemoryService({ rootDir }) } = {}) {
  return {
    async preview({ source = 'currículo local', text = '', documents = [], facts: provided } = {}) {
      const inputs = Array.isArray(documents) && documents.length ? documents : [{ path: source, text }];
      let facts = {};
      for (const document of inputs) {
        const extracted = extractStructuredFacts({ text: document.text ?? '', source: String(document.path ?? source) });
        const merged = mergeFacts(facts, extracted.facts);
        facts = merged.facts;
      }
      if (provided && typeof provided === 'object') facts = mergeFacts(facts, provided).facts;
      const missing = REQUIRED_FOR_FIRST_SEARCH.filter((key) => !facts[key]?.value);
      const questions = missing.slice(0, 5).map((key) => ({ key, prompt: questionFor(key), required: true }));
      return { facts, missing, questions, documents: inputs.map((document) => ({ path: String(document.path ?? source), imported: true })), summary: summarize(facts), ready: missing.length === 0 };
    },

    async commit({ preview, corrections = {} } = {}) {
      if (!preview?.facts) throw domainError('intake_preview_required', 'Revise o resumo antes de gravar o perfil.');
      const facts = Object.values(preview.facts).map((fact) => ({ ...fact, confirmed: true }));
      for (const [key, value] of Object.entries(corrections ?? {})) if (String(value ?? '').trim()) facts.push({ key, value: key === 'skills' || key === 'targetRoles' ? splitList(value) : String(value).trim(), source: 'correção do usuário', sourceLabel: 'Correção do usuário', confirmed: true });
      await memoryService.upsertFacts(facts);
      for (const document of preview.documents ?? []) if (document.path.replaceAll('\\', '/').startsWith('curriculo/')) await memoryService.saveResumeVariant({ path: document.path, label: document.path.split('/').at(-1), source: 'importação local' });
      return { ready: true, resumeVariants: (preview.documents ?? []).length, facts: (await memoryService.safeSummary()).facts, confirmation: 'Entendi seu perfil e deixei o contexto pronto para a primeira busca.' };
    }
  };
}

function splitList(value) { return Array.isArray(value) ? value : String(value).split(/,|;|\s+e\s+/i).map((item) => item.trim()).filter(Boolean); }
function questionFor(key) { return ({ name: 'Qual nome devo usar?', email: 'Qual e-mail devo usar nas candidaturas?', phone: 'Qual telefone devo usar?', location: 'Em que local você está?', targetRoles: 'Quais cargos devo priorizar?' }[key] ?? `Qual é o valor de ${key}?`); }
function summarize(facts) { return Object.fromEntries(Object.entries(facts).map(([key, fact]) => [key, fact.value])); }
function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
