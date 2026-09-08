import { acquireFluxoLock, wrapMutations } from './lock.mjs';
import { detectUnsupportedPage } from './unsupported-page.mjs';
import { classifySearchPage, queryFromSearchUrl } from './platform-search.mjs';
import { createStateDocument } from './state-document.mjs';

export function createDiscoveryService({ rootDir = '', persistence, queueService, adapters = {}, fixtureAdapters = {}, now = () => new Date(), mutationLock = true, lock = () => acquireFluxoLock(rootDir) } = {}) {
  const documento = createStateDocument({ rootDir, persistence, name: 'discovery', file: 'estado/discovery.json', fallback: { failures: [], opportunities: [] } });
  const service = {
    close() { documento.close(); },
    async authority() { return documento.authority(); },
    async discover(criteria = {}) {
      const platforms = normalizePlatforms(criteria.platforms ?? Object.keys(adapters));
      const opportunities = [];
      const failures = [];
      const empty = [];
      let duplicates = 0;
      // Cada vaga carrega a busca que a trouxe: a fila acumula buscas diferentes e a
      // pessoa precisa saber o que é de agora e o que é de antes.
      const searchAt = now().toISOString();
      const termoDosCriterios = list(criteria.query ?? criteria.roles ?? criteria.targetRoles).join(', ');
      for (const platform of platforms) {
        const adapter = criteria.mode === 'fixture' ? fixtureAdapters[platform] ?? adapters[platform] : adapters[platform];
        if (!adapter?.search) { failures.push({ platform, type: 'adapter_unavailable', message: 'A plataforma não está configurada.', retryable: true }); continue; }
        const planned = plannedSearch(criteria, platform);
        if (planned.unavailable) { failures.push({ platform, type: 'search_unavailable', message: planned.reason ?? 'A busca pública não está disponível nesta plataforma.', retryable: false }); continue; }
        try {
          const found = await adapter.search({ ...criteria, searchUrl: planned.searchUrl, platforms: [platform] });
          // Página vazia é resultado; página indisponível é falha. São coisas diferentes.
          const classificacao = classifySearchPage({ jobs: Array.isArray(found) ? found : [], emptyResults: criteria.emptyResults === true });
          if (classificacao.kind === 'unavailable') { failures.push({ platform, type: 'platform_unavailable', message: classificacao.message, retryable: true }); continue; }
          if (classificacao.kind === 'empty') { empty.push({ platform, message: classificacao.message }); }
          const busca = { searchAt, searchQuery: termoDosCriterios || queryFromSearchUrl(planned.searchUrl) };
          for (const raw of Array.isArray(found) ? found : []) {
            const item = { ...normalizeOpportunity(raw, platform, now), ...busca };
            try { const stored = await queueService.addQueueItem(item); opportunities.push(stored ?? item); }
            catch (error) { if (error?.code === 'queue_duplicate' || error?.code === 'queue_duplicate_cross_platform') duplicates += 1; else throw error; }
          }
        } catch (error) {
          failures.push({ platform, type: 'platform_unavailable', message: `Não foi possível consultar ${platform}.`, retryable: true, detail: String(error?.message ?? error) });
        }
      }
      const state = { runId: String(criteria.runId ?? ''), collectedAt: now().toISOString(), criteria: safeCriteria(criteria), opportunities, failures, empty, duplicates };
      await writeDiscoveryState(documento, state);
      return {
        ...state,
        created: opportunities,
        nextAction: failures.length
          ? 'Tentar novamente as plataformas indisponíveis quando estiverem acessíveis.'
          : empty.length && !opportunities.length
            ? 'A busca não retornou vagas nestas páginas. Ajustar os filtros ou manter o acompanhamento agendado.'
            : 'Recalcular a aderência e preparar a shortlist.'
      };
    },

    async resume(criteria = {}) {
      const previous = await readDiscoveryState(documento);
      const pending = previous.failures?.filter((failure) => failure.retryable).map((failure) => failure.platform) ?? [];
      return service.discover({ ...criteria, platforms: criteria.platforms ?? pending, runId: criteria.runId ?? previous.runId });
    }
  };
  return wrapMutations(service, ['discover', 'resume'], { rootDir, mutationLock, lock });
}

export function createPlaywrightDiscoveryAdapter({ driver, platform, parse = parseSnapshotJobs } = {}) {
  return { async search(criteria = {}) { if (criteria.searchUrl && driver.goto) await driver.goto(criteria.searchUrl); const snapshot = await driver.snapshot({ purpose: 'discovery', criteria }); return parse(snapshot, platform); } };
}

// Cada plataforma navega para a própria página de busca; sem isso um plano multiplataforma
// repetiria a mesma URL e atribuiria as vagas à plataforma errada.
function plannedSearch(criteria, platform) {
  const entry = (Array.isArray(criteria.searchPlan) ? criteria.searchPlan : [])
    .find((item) => String(item?.platform ?? '').toUpperCase() === platform);
  if (entry?.unavailable === true) return { unavailable: true, reason: entry.reason };
  return { searchUrl: entry?.searchUrl || criteria.searchUrl || '' };
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

function parseSnapshotJobs(snapshot, platform) {
  if (Array.isArray(snapshot?.jobs)) return snapshot.jobs;
  const jobs = (snapshot?.links ?? []).filter(link => link.company && link.text && /^https?:\/\//i.test(link.href)).map(link => ({ title: link.text, company: link.company, url: link.href, source: platform }));
  if (!jobs.length) {
    // Página vazia e página não suportada são situações diferentes; quem decide é o detector.
    const unsupported = detectUnsupportedPage({ ...snapshot, jobs, links: [] }, {
      capability: platform ? `busca em ${platform}` : 'busca de vagas',
      code: 'discovery_page_unsupported'
    });
    if (unsupported) throw unsupported;
  }
  return jobs;
}
function safeCriteria(criteria) { return { roles: list(criteria.roles ?? criteria.targetRoles), locations: list(criteria.locations), workModes: list(criteria.workModes), salary: String(criteria.salary ?? criteria.minimumSalary ?? ''), seniority: list(criteria.seniority), exclusions: list(criteria.exclusions), platforms: normalizePlatforms(criteria.platforms) }; }
function normalizePlatforms(value) { return list(value).map((item) => String(item).toUpperCase()); }
function list(value) { return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : String(value ?? '').split(/,|;/).map((item) => item.trim()).filter(Boolean); }
function slug(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'; }
async function readDiscoveryState(documento) { return documento.read(); }
async function writeDiscoveryState(documento, value) { return documento.write(value); }
