import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CONFIRMED_STATUSES = new Set([
  'enviada', 'triagem', 'teste pendente', 'teste concluído', 'entrevista', 'proposta', 'rejeitada', 'encerrada'
]);
const PRIORITY_RANK = { A: 1, B: 2, C: 3 };

export function createQueueService({ rootDir, now = () => new Date() }) {
  return {
    async listQueue() {
      const queue = await readJson(join(rootDir, 'fila', 'vagas.json'), []);
      return { items: asArray(queue), counts: countByStatus(asArray(queue)) };
    },

    async addQueueItem(input) {
      const item = normalizeInput(input, now);
      const queuePath = join(rootDir, 'fila', 'vagas.json');
      const applicationsPath = join(rootDir, 'candidaturas', 'candidaturas.json');
      const queue = asArray(await readJson(queuePath, []));
      const applications = asArray(await readJson(applicationsPath, []));

      if (queue.some((entry) => entry.key === item.key) || applications.some((entry) => entry.key === item.key)) {
        throw domainError('queue_duplicate', `A vaga já existe: ${item.identifierOrUrl}`);
      }
      if (!input.allowCrossPlatformDuplicate && [...queue, ...applications].some((entry) => fingerprintOf(entry) === item.fingerprint)) {
        throw domainError('queue_duplicate_cross_platform', `Possível duplicata: ${item.company} - ${item.role}`);
      }

      queue.push(item);
      await writeJsonAtomic(queuePath, queue);
      return item;
    },

    async claimNext({ id = '', platform = '' } = {}) {
      const campaign = await readJson(join(rootDir, 'campanha', 'config.json'), { platforms: [] });
      const queuePath = join(rootDir, 'fila', 'vagas.json');
      const queue = asArray(await readJson(queuePath, []));
      const applications = asArray(await readJson(join(rootDir, 'candidaturas', 'candidaturas.json'), []));
      const eligible = eligiblePlatforms(campaign, applications);
      const normalizedPlatform = platform ? normalizePlatform(platform) : '';
      const candidate = queue
        .filter((item) => item.status === 'na fila' && eligible.has(item.platform) && (!id || item.id === id) && (!normalizedPlatform || item.platform === normalizedPlatform))
        .sort(compareQueueItems)[0];

      if (!candidate) throw domainError('queue_empty', 'Nenhuma vaga elegível na fila.');
      candidate.status = 'em andamento';
      candidate.attempts = numberOrZero(candidate.attempts) + 1;
      candidate.updatedAt = now().toISOString();
      await writeJsonAtomic(queuePath, queue);
      await writeJsonAtomic(join(rootDir, 'estado', 'checkpoint.json'), {
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

    async recordQueueFailure(reference, errorMessage) {
      const campaign = await readJson(join(rootDir, 'campanha', 'config.json'), { maxConsecutiveFailures: 3 });
      const queuePath = join(rootDir, 'fila', 'vagas.json');
      const queue = asArray(await readJson(queuePath, []));
      const item = queue.find((entry) => entry.id === reference || entry.key === reference || entry.identifierOrUrl === reference);
      if (!item) throw domainError('queue_item_not_found', `Item da fila não encontrado: ${reference}`);

      const attempts = Math.max(1, numberOrZero(item.attempts));
      const maximum = Math.max(1, numberOrZero(campaign.maxConsecutiveFailures) || 3);
      item.attempts = attempts;
      item.lastError = String(errorMessage ?? 'Falha sem descrição');
      item.updatedAt = now().toISOString();
      item.status = attempts >= maximum ? 'bloqueada' : 'na fila';
      await writeJsonAtomic(queuePath, queue);
      await writeJsonAtomic(join(rootDir, 'estado', 'checkpoint.json'), {
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
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
  await rename(temporaryPath, path);
}

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
