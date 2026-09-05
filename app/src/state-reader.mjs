import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const CONFIRMED_APPLICATION_STATUSES = new Set([
  'enviada',
  'triagem',
  'teste pendente',
  'teste concluído',
  'entrevista',
  'proposta',
  'rejeitada',
  'encerrada'
]);

const SENSITIVE_KEY = /(password|token|cookie|secret|mfa|authorization|credential)/i;

export async function readFluxoState(rootDir) {
  const [preflight, campaign, queue, applications, checkpoint, memory, discovery, followup, exceptions] = await Promise.all([
    readJson(join(rootDir, 'estado', 'preflight.json'), { ready: false, checks: [] }),
    readJson(join(rootDir, 'campanha', 'config.json'), { platforms: [] }),
    readJson(join(rootDir, 'fila', 'vagas.json'), []),
    readJson(join(rootDir, 'candidaturas', 'candidaturas.json'), []),
    readJson(join(rootDir, 'estado', 'checkpoint.json'), null),
    readJson(join(rootDir, 'estado', 'memoria.json'), { facts: {}, resumes: [], executions: [] }),
    readJson(join(rootDir, 'estado', 'discovery.json'), { opportunities: [], failures: [], duplicates: 0 }),
    readJson(join(rootDir, 'estado', 'followup.json'), { events: [], checkedAt: '' }),
    readJson(join(rootDir, 'estado', 'excecoes.json'), [])
  ]);

  const safePreflight = redact(preflight);
  const safeCampaign = redact(campaign);
  const safeQueueItems = asArray(queue).map(redact);
  const safeApplicationItems = asArray(applications).map(redact);

  return {
    installation: {
      ready: safePreflight.ready === true,
      status: safePreflight.ready === true ? 'ready' : 'blocked'
    },
    preflight: safePreflight,
    campaign: {
      ...safeCampaign,
      totalGoal: numberOrZero(safeCampaign.totalGoal),
      dailyGoal: numberOrZero(safeCampaign.dailyGoal),
      weeklyGoal: numberOrZero(safeCampaign.weeklyGoal),
      platforms: asArray(safeCampaign.platforms)
    },
    queue: {
      items: safeQueueItems,
      counts: countByStatus(safeQueueItems)
    },
    applications: {
      items: safeApplicationItems,
      counts: countByStatus(safeApplicationItems),
      confirmedCount: safeApplicationItems.filter((item) => CONFIRMED_APPLICATION_STATUSES.has(item.status)).length
    },
    checkpoint: checkpoint === null ? null : redact(checkpoint),
    memory: redactMemory(memory),
    discovery: redact(discovery),
    followup: redact(followup),
    exceptions: Array.isArray(exceptions) ? exceptions.map((item) => redactException(redact(item))) : []
  };
}

async function readJson(path, fallback) {
  try {
    const content = await readFile(path, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw new Error(`Não foi possível ler ${path}: ${error.message}`, { cause: error });
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function countByStatus(items) {
  return items.reduce((counts, item) => {
    const status = typeof item.status === 'string' && item.status.trim() ? item.status : 'sem status';
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, entry]) => [key, redact(entry)])
  );
}

function redactException(value) {
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['response', 'observed', 'detail'].includes(key)));
}

function redactMemory(value) {
  const safe = redact(value);
  if (!safe || typeof safe !== 'object' || !safe.facts || typeof safe.facts !== 'object') return safe;
  safe.facts = Object.fromEntries(Object.entries(safe.facts).filter(([key, fact]) => !fact?.sensitive && !SENSITIVE_KEY.test(key)));
  return safe;
}
