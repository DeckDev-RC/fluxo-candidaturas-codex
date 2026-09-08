import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { acquireFluxoLock, wrapMutations } from './lock.mjs';

const PATH = 'estado/codex-settings.json';
const EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const VERBOSITIES = new Set(['low', 'medium', 'high']);
const SUMMARIES = new Set(['auto', 'concise', 'detailed', 'off']);

export function createCodexSettingsService({ rootDir = '', readModels = async () => [], now = () => new Date(), mutationLock = true, lock = () => acquireFluxoLock(rootDir) } = {}) {
  const service = {
    async get() { return readSettings(rootDir); },
    // Modelos que o Codex oferece agora (id e efforts), para a IA e a interface escolherem.
    async listModels() { return normalizeCatalog(await readModels()); },
    async update(input = {}) {
      const current = await readSettings(rootDir);
      const catalog = normalizeCatalog(await readModels());
      const model = String(input.model ?? current.model ?? '').trim();
      const selected = catalog.find((item) => item.id === model);
      if (catalog.length && !selected) throw domainError('unsupported_model', 'O modelo selecionado não está disponível no Codex.');
      const effort = String(input.effort ?? current.effort ?? 'medium').toLowerCase();
      const supportedEfforts = selected?.efforts?.length ? new Set(selected.efforts) : EFFORTS;
      if (!EFFORTS.has(effort) || !supportedEfforts.has(effort)) throw domainError('unsupported_reasoning_effort', 'Este modelo não oferece o effort selecionado.');
      const verbosity = String(input.verbosity ?? current.verbosity ?? 'medium').toLowerCase();
      if (!VERBOSITIES.has(verbosity)) throw domainError('invalid_verbosity', 'Verbosity deve ser low, medium ou high.');
      const reasoningSummary = String(input.reasoningSummary ?? current.reasoningSummary ?? 'auto').toLowerCase();
      if (!SUMMARIES.has(reasoningSummary)) throw domainError('invalid_reasoning_summary', 'Resumo de raciocínio inválido.');
      const saved = { model, effort, verbosity, reasoningSummary, source: 'user', updatedAt: now().toISOString() };
      await writeSettings(rootDir, saved);
      return saved;
    }
  };
  return wrapMutations(service, ['update'], { rootDir, mutationLock, lock });
}

async function readSettings(rootDir) { try { const value = JSON.parse(await readFile(join(rootDir, PATH), 'utf8')); return normalizeSettings(value); } catch (error) { if (error?.code === 'ENOENT') return normalizeSettings({}); throw error; } }
function normalizeSettings(value) { return { model: String(value?.model ?? ''), effort: String(value?.effort ?? 'medium'), verbosity: String(value?.verbosity ?? 'medium'), reasoningSummary: String(value?.reasoningSummary ?? 'auto'), source: String(value?.source ?? 'default'), updatedAt: String(value?.updatedAt ?? '') }; }
function normalizeCatalog(models) { return (Array.isArray(models) ? models : []).map((model) => ({ id: String(model.id ?? ''), efforts: Array.isArray(model.efforts) ? model.efforts.map(String) : Array.isArray(model.supportedReasoningEfforts) ? model.supportedReasoningEfforts.map((item) => String(item.reasoningEffort ?? item.value ?? item)) : [] })).filter((model) => model.id); }
async function writeSettings(rootDir, value) { const path = join(rootDir, PATH); await mkdir(join(rootDir, 'estado'), { recursive: true }); await copyBackup(path); const temp = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(value, null, 2), 'utf8'); await rename(temp, path); }
async function copyBackup(path) { try { await writeFile(`${path}.bak`, await readFile(path)); } catch (error) { if (error?.code !== 'ENOENT') throw error; } }
function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
