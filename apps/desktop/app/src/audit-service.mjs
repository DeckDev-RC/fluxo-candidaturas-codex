import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SECRET = /(password|token|cookie|secret|mfa|authorization|credential|senha)/i;

export function createAuditService({ rootDir = '', now = () => new Date() } = {}) {
  return {
    async record(input = {}) {
      const value = { id: randomUUID(), runId: String(input.runId ?? ''), task: String(input.task ?? ''), tool: String(input.tool ?? ''), observation: redact(input.observation ?? {}), result: redact(input.result ?? {}), url: String(input.url ?? input.observation?.url ?? ''), source: String(input.source ?? 'local'), confidence: String(input.confidence ?? 'não informado'), reason: String(input.reason ?? ''), beforeHash: String(input.beforeHash ?? ''), afterHash: String(input.afterHash ?? ''), timestamp: now().toISOString() };
      value.hash = createHash('sha256').update(JSON.stringify(value)).digest('hex');
      const entries = await this.list(value.runId); entries.push(value); await writeTrace(rootDir, value.runId, entries);
      return value;
    },
    async list(runId) { try { const value = JSON.parse(await readFile(tracePath(rootDir, runId), 'utf8')); return Array.isArray(value) ? value : []; } catch (error) { if (error?.code === 'ENOENT') return []; throw error; } },
    async exportPackage({ runId }) { const entries = await this.list(runId); const payload = { version: 1, runId: String(runId), exportedAt: now().toISOString(), entries: redact(entries) }; const path = `evidencias/auditoria-${safeId(runId)}.json`; const absolute = join(rootDir, path); await mkdir(join(rootDir, 'evidencias'), { recursive: true }); await writeFile(absolute, JSON.stringify(payload, null, 2), 'utf8'); return { path, sha256: createHash('sha256').update(await readFile(absolute)).digest('hex'), entries: entries.length }; }
  };
}

function redact(value) { if (Array.isArray(value)) return value.map(redact); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET.test(key)).map(([key, entry]) => [key, redact(entry)])); }
function safeId(value) { return String(value ?? 'run').replace(/[^a-zA-Z0-9_-]/g, '_'); }
function tracePath(rootDir, runId) { return join(rootDir, 'estado', 'traces', `${safeId(runId)}.json`); }
async function writeTrace(rootDir, runId, entries) { const path = tracePath(rootDir, runId); await mkdir(join(rootDir, 'estado', 'traces'), { recursive: true }); const temp = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(entries, null, 2), 'utf8'); await rename(temp, path); }
