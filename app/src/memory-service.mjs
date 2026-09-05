import { randomUUID } from 'node:crypto';
import { acquireFluxoLock, wrapMutations } from './lock.mjs';
import { createStateDocument } from './state-document.mjs';

const MEMORY_FILE = 'estado/memoria.json';
const SECRET = /(password|token|cookie|secret|mfa|authorization|credential|senha)/i;

export function createMemoryService({ rootDir, persistence, now = () => new Date(), mutationLock = true, lock = () => acquireFluxoLock(rootDir) } = {}) {
  const documento = createStateDocument({ rootDir, persistence, name: 'memory', file: MEMORY_FILE, fallback: {} });
  const service = {
    close() { documento.close(); },
    async authority() { return documento.authority(); },
    async get() { return readMemory(documento); },

    async safeSummary() {
      const memory = await readMemory(documento);
      const facts = Object.fromEntries(Object.entries(memory.facts).filter(([key, fact]) => !SECRET.test(key) && !fact.sensitive).map(([key, fact]) => [key, redactFact(fact)]));
      const selectedResume = memory.resumes.find((resume) => resume.selected) ?? null;
      const gaps = Object.entries(facts).filter(([, fact]) => fact.confirmed !== true).map(([key]) => key);
      return { facts, selectedResume, preferences: redactValue(memory.preferences), answers: redactValue(memory.answers), gaps, conflicts: memory.conflicts ?? [], lastExecution: memory.executions.at(-1) ?? null, lastUpdated: memory.updatedAt };
    },

    async upsertFacts(facts = []) {
      const memory = await readMemory(documento);
      const timestamp = now().toISOString();
      for (const input of Array.isArray(facts) ? facts : []) {
        const key = String(input?.key ?? '').trim();
        if (!key || SECRET.test(key)) continue;
        const previous = memory.facts[key];
        if (previous && stringify(previous.value) !== stringify(input.value) && previous.confirmed && input.confirmed) {
          memory.conflicts = [...(memory.conflicts ?? []), { key, previous: previous.value, incoming: input.value, updatedAt: timestamp }];
        }
        memory.facts[key] = {
          id: previous?.id ?? randomUUID(), value: clone(input.value), source: String(input.source ?? previous?.source ?? 'manual'),
          sourceLabel: String(input.sourceLabel ?? previous?.sourceLabel ?? input.source ?? 'Origem local'),
          extractedAt: input.extractedAt ?? previous?.extractedAt ?? timestamp,
          confirmed: input.confirmed === true, sensitive: input.sensitive === true, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp
        };
      }
      memory.updatedAt = timestamp;
      await writeMemory(documento, memory);
      return memory;
    },

    async removeFact(key) {
      const memory = await readMemory(documento);
      delete memory.facts[String(key)];
      memory.conflicts = (memory.conflicts ?? []).filter((item) => item.key !== String(key));
      memory.updatedAt = now().toISOString();
      await writeMemory(documento, memory);
      return memory;
    },

    // Conflitos ficam guardados até a pessoa escolher qual versão vale.
    async recordConflicts(conflicts = []) {
      const memory = await readMemory(documento);
      const timestamp = now().toISOString();
      const existentes = new Map((memory.conflicts ?? []).map((item) => [`${item.key}|${stringify(item.incoming)}`, item]));
      for (const conflito of Array.isArray(conflicts) ? conflicts : []) {
        const chave = String(conflito?.key ?? '').trim();
        if (!chave || SECRET.test(chave)) continue;
        existentes.set(`${chave}|${stringify(conflito.incoming)}`, {
          key: chave,
          previous: clone(conflito.previous),
          incoming: clone(conflito.incoming),
          updatedAt: String(conflito.extractedAt ?? timestamp)
        });
      }
      memory.conflicts = [...existentes.values()].slice(-20);
      memory.updatedAt = timestamp;
      await writeMemory(documento, memory);
      return memory.conflicts;
    },

    // Resolver um conflito é decisão da pessoa: o valor escolhido vira fato confirmado.
    async resolveConflict(key, value) {
      const chave = String(key ?? '').trim();
      if (!chave) throw domainError('invalid_conflict', 'Informe qual informação está sendo resolvida.');
      await service.upsertFacts([{ key: chave, value, source: 'decisão do usuário', sourceLabel: 'Decisão do usuário', confirmed: true }]);
      const memory = await readMemory(documento);
      memory.conflicts = (memory.conflicts ?? []).filter((item) => item.key !== chave);
      memory.updatedAt = now().toISOString();
      await writeMemory(documento, memory);
      return memory.conflicts;
    },

    async saveResumeVariant(input = {}) {
      const path = String(input.path ?? '').trim();
      if (!path || !path.replaceAll('\\', '/').startsWith('curriculo/')) throw domainError('invalid_resume_path', 'Currículo deve ficar em curriculo/.');
      const memory = await readMemory(documento);
      const timestamp = now().toISOString();
      const existing = memory.resumes.find((resume) => resume.path === path);
      const value = { id: existing?.id ?? randomUUID(), path, label: String(input.label ?? existing?.label ?? path.split('/').at(-1)), objective: String(input.objective ?? existing?.objective ?? ''), selected: input.selected === true || existing?.selected === true, source: String(input.source ?? existing?.source ?? 'importação local'), sha256: String(input.sha256 ?? existing?.sha256 ?? ''), updatedAt: timestamp, createdAt: existing?.createdAt ?? timestamp };
      memory.resumes = memory.resumes.filter((resume) => resume.path !== path);
      if (value.selected) memory.resumes = memory.resumes.map((resume) => ({ ...resume, selected: false }));
      memory.resumes.push(value);
      memory.updatedAt = timestamp;
      await writeMemory(documento, memory);
      return value;
    },

    async recordAnswers(answers = {}) {
      const memory = await readMemory(documento);
      const timestamp = now().toISOString();
      memory.answers = { ...memory.answers, ...clone(answers) };
      const facts = Object.entries(answers).map(([key, value]) => ({ key, value, source: 'resposta do usuário', sourceLabel: 'Resposta do usuário', confirmed: true, extractedAt: timestamp }));
      memory.updatedAt = timestamp;
      await writeMemory(documento, memory);
      await service.upsertFacts(facts);
      return memory.answers;
    },

    async recordExecution(input = {}) {
      const memory = await readMemory(documento);
      const timestamp = now().toISOString();
      memory.executions = [...memory.executions.filter((item) => item.runId !== input.runId), { runId: String(input.runId ?? ''), objective: String(input.objective ?? ''), status: String(input.status ?? 'running'), checkpoint: String(input.checkpoint ?? ''), platform: String(input.platform ?? ''), updatedAt: timestamp }].slice(-50);
      memory.updatedAt = timestamp;
      await writeMemory(documento, memory);
      return memory.executions.at(-1);
    },

    async contextForTask({ task = '', runId = '' } = {}) {
      const memory = await service.safeSummary();
      const execution = memory.lastExecution?.runId === runId ? memory.lastExecution : memory.lastExecution ?? null;
      return { task: String(task), objective: execution?.objective ?? '', ...memory, execution };
    }
  };
  return wrapMutations(service, ['upsertFacts', 'removeFact', 'saveResumeVariant', 'recordAnswers', 'recordExecution', 'recordConflicts', 'resolveConflict'], { rootDir, mutationLock, lock });
}

async function readMemory(documento) {
  return normalizeMemory(await documento.read());
}

function normalizeMemory(value) {
  return { version: 1, facts: value?.facts && typeof value.facts === 'object' && !Array.isArray(value.facts) ? value.facts : {}, resumes: Array.isArray(value?.resumes) ? value.resumes : [], answers: value?.answers && typeof value.answers === 'object' ? value.answers : {}, preferences: value?.preferences && typeof value.preferences === 'object' ? value.preferences : {}, executions: Array.isArray(value?.executions) ? value.executions : [], conflicts: Array.isArray(value?.conflicts) ? value.conflicts : [], updatedAt: String(value?.updatedAt ?? '') };
}

async function writeMemory(documento, memory) {
  return documento.write(memory);
}

function redactFact(fact) { return { value: clone(fact.value), source: fact.sourceLabel || fact.source, confirmed: fact.confirmed === true, extractedAt: fact.extractedAt, updatedAt: fact.updatedAt }; }
function stringify(value) { return JSON.stringify(value); }
function redactValue(value) { return clone(value); }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
