import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acquireFluxoLock, wrapMutations } from './lock.mjs';
import { createAutoPersistence } from './persistence-authority.mjs';
import { canTransitionQueue, QUEUE_STATUS } from './domain/queue-status.mjs';
import { platformOfUrl } from './platform-search.mjs';

const CONFIRMED_STATUSES = new Set([
  'enviada', 'triagem', 'teste pendente', 'teste concluído', 'entrevista', 'proposta', 'rejeitada', 'encerrada'
]);
const PRIORITY_RANK = { A: 1, B: 2, C: 3 };
const PRIORITY_BY_FIT = { forte: 'A', possível: 'B', fraca: 'C' };

export function createQueueService({ rootDir, persistence: injectedPersistence, now = () => new Date(), checkpointAfterEachAction = true, maxConsecutiveFailures = null, mutationLock = true, lock = () => acquireFluxoLock(rootDir) }) {
  const ownedPersistence = injectedPersistence ? null : createAutoPersistence({ rootDir });
  const persistence = injectedPersistence ?? ownedPersistence;
  const close = () => ownedPersistence?.close();
  const service = { close,
    async listQueue() {
      const queue = await readQueue(rootDir, persistence);
      return { items: asArray(queue), counts: countByStatus(asArray(queue)) };
    },

    async search({ query = '', platform = '', status = '', minFit = 0 } = {}) {
      const queue = await readQueue(rootDir, persistence);
      const needle = String(query).trim().toLocaleLowerCase();
      const minimum = Number(minFit) || 0;
      return queue.filter((item) => (!needle || `${item.company ?? ''} ${item.role ?? ''} ${item.identifierOrUrl ?? ''}`.toLocaleLowerCase().includes(needle)) && (!platform || item.platform === normalizePlatform(platform)) && (!status || item.status === status) && Number(item.fitScore ?? 0) >= minimum);
    },

    async addQueueItem(input) {
      const item = normalizeInput(input, now);
      const queuePath = join(rootDir, 'fila', 'vagas.json');
      const queue = await readQueue(rootDir, persistence);
      const applications = await readApplications(rootDir, persistence);

      if (queue.some((entry) => entry.key === item.key) || applications.some((entry) => entry.key === item.key)) {
        throw domainError('queue_duplicate', `A vaga já existe: ${item.identifierOrUrl}`);
      }
      if (!input.allowCrossPlatformDuplicate && [...queue, ...applications].some((entry) => fingerprintOf(entry) === item.fingerprint)) {
        throw domainError('queue_duplicate_cross_platform', `Possível duplicata: ${item.company} - ${item.role}`);
      }

      queue.push(item);
      await saveQueue(queuePath, queue, persistence);
      return item;
    },

    async claimNext({ id = '', platform = '' } = {}) {
      const campaign = await readCampaign(rootDir, persistence);
      const queuePath = join(rootDir, 'fila', 'vagas.json');
      const queue = await readQueue(rootDir, persistence);
      const applications = await readApplications(rootDir, persistence);
      const eligible = eligiblePlatforms(campaign, applications);
      const normalizedPlatform = platform ? normalizePlatform(platform) : '';
      const candidate = queue
        .filter((item) => item.status === 'na fila' && eligible.has(item.platform) && (!id || item.id === id) && (!normalizedPlatform || item.platform === normalizedPlatform) && !isExcluded(item, campaign.exclusions))
        .sort(compareQueueItems)[0];

      if (!candidate) throw domainError('queue_empty', 'Nenhuma vaga elegível na fila.');
      const decision = canTransitionQueue(candidate.status, QUEUE_STATUS.IN_PROGRESS, { targetEligible: eligible.has(candidate.platform) });
      if (!decision.allowed) throw domainError(decision.reason, 'Transição de fila não permitida.');
      candidate.status = QUEUE_STATUS.IN_PROGRESS;
      candidate.attempts = numberOrZero(candidate.attempts) + 1;
      candidate.updatedAt = now().toISOString();
      await saveQueue(queuePath, queue, persistence);
      if (checkpointAfterEachAction) await writeJsonAtomic(join(rootDir, 'estado', 'checkpoint.json'), {
        updatedAt: candidate.updatedAt,
        phase: 'vaga selecionada',
        platform: candidate.platform,
        url: candidate.identifierOrUrl,
        applicationKey: candidate.key,
        notes: `Tentativa ${candidate.attempts}`,
        blocker: '',
        consecutiveFailures: 0
      });
      return candidate;
    },

    // A comparação de aderência fica gravada na vaga: nota e prioridade passam a
    // ordenar a fila e a aparecer na tela em vez de "aderência não calculada".
    async recordFit(assessments = []) {
      const queuePath = join(rootDir, 'fila', 'vagas.json');
      const queue = await readQueue(rootDir, persistence);
      let updated = 0;
      for (const assessment of asArray(assessments)) {
        const reference = String(assessment?.opportunityId ?? assessment?.id ?? '');
        const item = queue.find((entry) => entry.id === reference || entry.key === reference);
        if (!item || !Number.isFinite(Number(assessment.score))) continue;
        item.fitScore = Math.max(0, Math.min(100, Number(assessment.score)));
        item.priority = PRIORITY_BY_FIT[assessment.classification] ?? item.priority ?? 'B';
        item.fitExplanation = String(assessment.explanation ?? '');
        item.fitEvaluatedAt = String(assessment.evaluatedAt ?? now().toISOString());
        item.updatedAt = now().toISOString();
        updated += 1;
      }
      if (updated) await saveQueue(queuePath, queue, persistence);
      return { updated };
    },

    // Detalhes lidos na página da vaga (requisitos, descrição, modalidade, local):
    // só campos observados sobrescrevem; nada é apagado por falta de leitura.
    async updateItemDetails(reference, details = {}) {
      const queuePath = join(rootDir, 'fila', 'vagas.json');
      const queue = await readQueue(rootDir, persistence);
      const item = queue.find((entry) => entry.id === reference || entry.key === reference || entry.identifierOrUrl === reference);
      if (!item) throw domainError('queue_item_not_found', `Item da fila não encontrado: ${reference}`);
      const requirements = asArray(details.requirements).map(String).map((texto) => texto.trim()).filter(Boolean);
      if (requirements.length) item.requirements = requirements;
      if (asArray(details.eliminators).length) item.eliminators = asArray(details.eliminators).map(String);
      for (const campo of ['description', 'workMode', 'location', 'salary', 'deadline']) {
        if (String(details[campo] ?? '').trim()) item[campo] = String(details[campo]).trim().slice(0, campo === 'description' ? 4000 : 200);
      }
      item.detailsObservedAt = now().toISOString();
      item.updatedAt = item.detailsObservedAt;
      await saveQueue(queuePath, queue, persistence);
      return item;
    },

    // Descarte a pedido da pessoa: por identificadores ou por texto (cargo/empresa).
    // A vaga fica registrada como "descartada": não volta como novidade na próxima busca.
    async discardItems({ ids = [], query = '', reason = '' } = {}) {
      const alvos = new Set(asArray(ids).map(String).filter(Boolean));
      const termo = String(query ?? '').trim().toLocaleLowerCase();
      if (!alvos.size && !termo) throw domainError('discard_selector_required', 'Informe quais vagas descartar: identificadores ou um texto de cargo/empresa.');
      const queuePath = join(rootDir, 'fila', 'vagas.json');
      const queue = await readQueue(rootDir, persistence);
      const descartadas = [];
      for (const item of queue) {
        const porId = alvos.has(item.id) || alvos.has(item.key);
        const porTexto = termo && `${item.role ?? ''} ${item.company ?? ''}`.toLocaleLowerCase().includes(termo);
        if (!porId && !porTexto) continue;
        if (!canTransitionQueue(item.status, QUEUE_STATUS.DISCARDED).allowed) continue;
        item.status = QUEUE_STATUS.DISCARDED;
        item.discardReason = String(reason ?? '').trim();
        item.discardedAt = now().toISOString();
        item.updatedAt = item.discardedAt;
        descartadas.push({ id: item.id, role: item.role, company: item.company, platform: item.platform });
      }
      if (descartadas.length) await saveQueue(queuePath, queue, persistence);
      return { discarded: descartadas.length, items: descartadas, remaining: queue.filter((item) => item.status === QUEUE_STATUS.QUEUED || item.status === QUEUE_STATUS.IN_PROGRESS).length };
    },

    async recordQueueFailure(reference, errorMessage) {
      const campaign = await readCampaign(rootDir, persistence);
      const queuePath = join(rootDir, 'fila', 'vagas.json');
      const queue = await readQueue(rootDir, persistence);
      const item = queue.find((entry) => entry.id === reference || entry.key === reference || entry.identifierOrUrl === reference);
      if (!item) throw domainError('queue_item_not_found', `Item da fila não encontrado: ${reference}`);

      const attempts = Math.max(1, numberOrZero(item.attempts));
      const maximum = Math.max(1, numberOrZero(maxConsecutiveFailures) || numberOrZero(campaign.maxConsecutiveFailures) || 3);
      item.attempts = attempts;
      item.lastError = String(errorMessage ?? 'Falha sem descrição');
      item.updatedAt = now().toISOString();
      item.status = attempts >= maximum ? 'bloqueada' : 'na fila';
      await saveQueue(queuePath, queue, persistence);
      if (checkpointAfterEachAction) await writeJsonAtomic(join(rootDir, 'estado', 'checkpoint.json'), {
        updatedAt: item.updatedAt,
        phase: 'falha',
        platform: item.platform,
        url: item.identifierOrUrl,
        applicationKey: item.key,
        notes: item.lastError,
        blocker: item.lastError,
        consecutiveFailures: attempts
      });
      return { reference: item.id, attempts, maximum, status: item.status, error: item.lastError };
    }
  };
  return wrapMutations(service, ['addQueueItem', 'claimNext', 'recordFit', 'updateItemDetails', 'discardItems', 'recordQueueFailure'], { rootDir, mutationLock, lock });
}

async function useSqlite(persistence) { return Boolean(persistence?.isSqliteAuthority && await persistence.isSqliteAuthority()); }
async function readCampaign(rootDir, persistence) { return await useSqlite(persistence) ? persistence.getCampaign() : readJson(join(rootDir, 'campanha', 'config.json'), { platforms: [] }); }
async function readQueue(rootDir, persistence) { return asArray(await useSqlite(persistence) ? await persistence.getQueue() : await readJson(join(rootDir, 'fila', 'vagas.json'), [])).map(sanearHerdado); }

// Vagas gravadas por versões anteriores do leitor de cartões: plataforma "CARD"
// (a origem virou plataforma) e título duplicado ("X X", trecho oculto do LinkedIn).
// Corrigidas na leitura para a pessoa não ver nem descartar lixo por causa disso.
function sanearHerdado(item) {
  if (!item || typeof item !== 'object') return item;
  let mudou = false;
  const saneado = { ...item };
  if (String(saneado.platform ?? '').toUpperCase() === 'CARD') { saneado.platform = platformOfUrl(saneado.identifierOrUrl) || 'DESCONHECIDA'; mudou = true; }
  const titulo = String(saneado.role ?? '').trim();
  const metade = titulo.slice(0, Math.floor(titulo.length / 2)).trim();
  if (metade && titulo.length % 2 === 1 && titulo === `${metade} ${metade}`) { saneado.role = metade; mudou = true; }
  return mudou ? saneado : item;
}
async function readApplications(rootDir, persistence) { return asArray(await useSqlite(persistence) ? await persistence.getApplications() : await readJson(join(rootDir, 'candidaturas', 'candidaturas.json'), [])); }
async function saveQueue(path, value, persistence) { if (await useSqlite(persistence)) return persistence.replaceQueue(value); return writeJsonAtomic(path, value); }

function isExcluded(item, exclusions = []) {
  const text = `${item.company ?? ''} ${item.role ?? ''}`.toLocaleLowerCase();
  return Array.isArray(exclusions) && exclusions.some((value) => String(value).trim() && text.includes(String(value).toLocaleLowerCase()));
}

function normalizeInput(input, now) {
  for (const field of ['platform', 'company', 'role', 'identifierOrUrl']) {
    if (!String(input?.[field] ?? '').trim()) throw domainError('invalid_queue_item', `${field} é obrigatório.`);
  }
  const platform = normalizePlatform(input.platform);
  const company = String(input.company).trim();
  const role = String(input.role).trim();
  const identifierOrUrl = String(input.identifierOrUrl).trim();
  const timestamp = now().toISOString();
  return {
    id: randomUUID().replaceAll('-', ''),
    key: applicationKey(platform, identifierOrUrl, company, role),
    fingerprint: `${slug(company)}|${slug(role)}`,
    platform,
    company,
    role,
    identifierOrUrl,
    location: String(input.location ?? ''), salary: String(input.salary ?? ''),
    requirements: asArray(input.requirements).map(String), eliminators: asArray(input.eliminators).map(String),
    collectedAt: String(input.collectedAt ?? timestamp), sourceObservedAt: String(input.sourceObservedAt ?? timestamp), sourceEvidence: input.sourceEvidence ?? null,
    // A busca que trouxe a vaga (termo e instante), para agrupar a fila por busca.
    searchQuery: String(input.searchQuery ?? ''), searchAt: String(input.searchAt ?? input.collectedAt ?? timestamp),
    priority: ['A', 'B', 'C'].includes(input.priority) ? input.priority : 'B',
    fitScore: Math.max(0, Math.min(100, numberOrZero(input.fitScore))),
    workMode: String(input.workMode ?? ''),
    deadline: String(input.deadline ?? ''),
    source: String(input.source ?? 'harness'),
    notes: String(input.notes ?? ''),
    status: 'na fila',
    attempts: 0,
    addedAt: timestamp,
    updatedAt: timestamp,
    lastError: ''
  };
}

function eligiblePlatforms(campaign, applications) {
  const result = new Set();
  for (const platform of asArray(campaign.platforms)) {
    const done = applications.filter((item) => item.platform === platform.name && CONFIRMED_STATUSES.has(item.status)).length;
    if (platform.enabled && numberOrZero(platform.goal) > done) result.add(platform.name);
  }
  return result;
}

function compareQueueItems(left, right) {
  return (PRIORITY_RANK[left.priority] ?? 99) - (PRIORITY_RANK[right.priority] ?? 99)
    || numberOrZero(right.fitScore) - numberOrZero(left.fitScore)
    || deadlineRank(left.deadline) - deadlineRank(right.deadline)
    || String(left.addedAt ?? '').localeCompare(String(right.addedAt ?? ''));
}

function deadlineRank(value) {
  return value ? Date.parse(value) || Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
}

function applicationKey(platform, identifier, company, role) {
  const identity = identifier ? identifier.replace(/\/+$/, '').toLowerCase() : `${slug(company)}|${slug(role)}`;
  return `${platform}|${identity}`;
}

function fingerprintOf(item) {
  return item.fingerprint || `${slug(item.company)}|${slug(item.role)}`;
}

function normalizePlatform(value) {
  const slugValue = slug(value);
  if (slugValue.startsWith('gupy')) return 'GUPY';
  if (slugValue.includes('infojobs')) return 'INFOJOBS';
  if (slugValue.includes('pandape')) return 'PANDAPE';
  if (slugValue.includes('linkedin')) return 'LINKEDIN';
  if (slugValue.includes('catho')) return 'CATHO';
  if (slugValue.startsWith('vagas')) return 'VAGASCOM';
  if (slugValue.includes('solides')) return 'SOLIDES';
  return String(value).trim().toUpperCase();
}

function slug(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function countByStatus(items) {
  return items.reduce((counts, item) => {
    const status = item.status || 'sem status';
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(join(path, '..'), { recursive: true });
  await copyFile(path, `${path}.bak`).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
  await rename(temporaryPath, path);
}

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
