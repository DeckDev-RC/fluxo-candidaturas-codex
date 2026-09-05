import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { acquireFluxoLock, wrapMutations } from './lock.mjs';

export function createDiscoveryService({ rootDir = '', queueService, adapters = {}, fixtureAdapters = {}, now = () => new Date(), mutationLock = true, lock = () => acquireFluxoLock(rootDir) } = {}) {
  const service = {
    async discover(criteria = {}) {
      const platforms = normalizePlatforms(criteria.platforms ?? Object.keys(adapters));
      const opportunities = [];
      const failures = [];
      let duplicates = 0;
      for (const platform of platforms) {
        const adapter = criteria.mode === 'fixture' ? fixtureAdapters[platform] ?? adapters[platform] : adapters[platform];
        if (!adapter?.search) { failures.push({ platform, type: 'adapter_unavailable', message: 'A plataforma não está configurada.', retryable: true }); continue; }
        try {
          const found = await adapter.search({ ...criteria, platforms: [platform] });
          for (const raw of Array.isArray(found) ? found : []) {
            const item = normalizeOpportunity(raw, platform, now);
            try { const stored = await queueService.addQueueItem(item); opportunities.push(stored ?? item); }
            catch (error) { if (error?.code === 'queue_duplicate' || error?.code === 'queue_duplicate_cross_platform') duplicates += 1; else throw error; }
          }
        } catch (error) {
          failures.push({ platform, type: 'platform_unavailable', message: `Não foi possível consultar ${platform}.`, retryable: true, detail: String(error?.message ?? error) });
        }
      }
      const state = { runId: String(criteria.runId ?? ''), collectedAt: now().toISOString(), criteria: safeCriteria(criteria), opportunities, failures, duplicates };
      await writeDiscoveryState(rootDir, state);
      return { ...state, created: opportunities, nextAction: failures.length ? 'Tentar novamente as plataformas indisponíveis quando estiverem acessíveis.' : 'Recalcular a aderência e preparar a shortlist.' };
    },

    async resume(criteria = {}) {
      const previous = await readDiscoveryState(rootDir);
      const pending = previous.failures?.filter((failure) => failure.retryable).map((failure) => failure.platform) ?? [];
      return service.discover({ ...criteria, platforms: criteria.platforms ?? pending, runId: criteria.runId ?? previous.runId });
    }
  };
  return wrapMutations(service, ['discover', 'resume'], { rootDir, mutationLock, lock });
}

export function createPlaywrightDiscoveryAdapter({ driver, platform, parse = parseSnapshotJobs } = {}) {
  return { async search(criteria = {}) { if (criteria.searchUrl && driver.goto) await driver.goto(criteria.searchUrl); const snapshot = await driver.snapshot({ purpose: 'discovery', criteria }); return parse(snapshot, platform); } };
}

function normalizeOpportunity(raw, platform, now) {
  const title = String(raw.title ?? raw.role ?? '').trim();
  const company = String(raw.company ?? '').trim();
  const identifierOrUrl = String(raw.identifierOrUrl ?? raw.url ?? raw.id ?? `${company}-${title}`).trim();
  const source = String(raw.source ?? platform).toUpperCase();
  const timestamp = now().toISOString();
  return {
    id: String(raw.id ?? `${slug(platform)}-${slug(identifierOrUrl)}`),
    key: `${source}|${identifierOrUrl.replace(/\/+$/, '').toLowerCase()}`,
    fingerprint: `${slug(company)}|${slug(title)}`,
    platform: source, company, role: title, identifierOrUrl,
    location: String(raw.location ?? ''), workMode: String(raw.workMode ?? raw.modality ?? ''), salary: String(raw.salary ?? ''),
    requirements: list(raw.requirements ?? raw.requiredTerms), eliminators: list(raw.eliminators), deadline: String(raw.deadline ?? ''),
    priority: raw.priority ?? 'B', fitScore: Number(raw.fitScore ?? 0), source, collectedAt: timestamp, sourceObservedAt: timestamp,
    sourceEvidence: { type: 'observation', source, collectedAt: timestamp, url: identifierOrUrl }, status: 'na fila', attempts: 0, failureCount: 0, addedAt: timestamp, updatedAt: timestamp, notes: String(raw.notes ?? ''), lastError: ''
  };
}

function parseSnapshotJobs(snapshot, platform) { return Array.isArray(snapshot?.jobs) ? snapshot.jobs : []; }
function safeCriteria(criteria) { return { roles: list(criteria.roles ?? criteria.targetRoles), locations: list(criteria.locations), workModes: list(criteria.workModes), salary: String(criteria.salary ?? criteria.minimumSalary ?? ''), seniority: list(criteria.seniority), exclusions: list(criteria.exclusions), platforms: normalizePlatforms(criteria.platforms) }; }
function normalizePlatforms(value) { return list(value).map((item) => String(item).toUpperCase()); }
function list(value) { return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : String(value ?? '').split(/,|;/).map((item) => item.trim()).filter(Boolean); }
function slug(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'; }
async function readDiscoveryState(rootDir) { try { return JSON.parse(await readFile(join(rootDir, 'estado', 'discovery.json'), 'utf8')); } catch (error) { if (error?.code === 'ENOENT') return { failures: [], opportunities: [] }; throw error; } }
async function writeDiscoveryState(rootDir, value) { const path = join(rootDir, 'estado', 'discovery.json'); await mkdir(join(rootDir, 'estado'), { recursive: true }); const temp = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(value, null, 2), 'utf8'); await rename(temp, path); }
