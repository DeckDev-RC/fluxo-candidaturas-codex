import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acquireFluxoLock, wrapMutations } from './lock.mjs';
import { createAutoPersistence } from './persistence-authority.mjs';

export function createCampaignService({ rootDir, persistence: injectedPersistence, mutationLock = true, lock = () => acquireFluxoLock(rootDir) }) {
  const ownedPersistence = injectedPersistence ? null : createAutoPersistence({ rootDir });
  const persistence = injectedPersistence ?? ownedPersistence;
  const close = () => ownedPersistence?.close();
  const service = { close,
    async getCampaign() {
      return await sqlite(persistence) ? persistence.getCampaign() : readJson(join(rootDir, 'campanha', 'config.json'), { platforms: [] });
    },

    async listPlatforms() {
      const config = await readJson(join(rootDir, 'config', 'plataformas.json'), { platforms: [] });
      return asArray(config.platforms);
    },

    async updateCampaign(patch) {
      const current = await sqlite(persistence) ? await persistence.getCampaign() : await readJson(join(rootDir, 'campanha', 'config.json'), { platforms: [] });
      const platformDefinitions = await this.listPlatforms();
      const allowedNames = new Set(platformDefinitions.map((item) => item.name));
      const next = { ...current, ...patch };

      for (const field of ['totalGoal', 'dailyGoal', 'weeklyGoal', 'maxConsecutiveFailures', 'maxApplicationsPerRun', 'maxTaskAttempts', 'maxRunTokens']) {
        if (field in next && (!Number.isInteger(Number(next[field])) || Number(next[field]) < 0)) {
          throw domainError('invalid_campaign', `${field} deve ser um inteiro não negativo.`);
        }
        if (field in next) next[field] = Number(next[field]);
      }
      if ('platforms' in next) {
        if (!Array.isArray(next.platforms)) throw domainError('invalid_campaign', 'platforms deve ser uma lista.');
        for (const platform of next.platforms) {
          if (!allowedNames.has(platform.name)) throw domainError('invalid_platform', `Plataforma desconhecida: ${platform.name}`);
          if (Number(platform.goal) < 0 || !Number.isInteger(Number(platform.goal))) throw domainError('invalid_campaign', 'A meta da plataforma deve ser um inteiro não negativo.');
          platform.goal = Number(platform.goal);
          platform.enabled = platform.enabled === true;
        }
      }

      if (await sqlite(persistence)) await persistence.saveCampaign(next);
      else await writeJsonAtomic(join(rootDir, 'campanha', 'config.json'), next);
      return next;
    }
  };
  return wrapMutations(service, ['updateCampaign'], { rootDir, mutationLock, lock });
}

async function sqlite(persistence) { return Boolean(persistence?.isSqliteAuthority && await persistence.isSqliteAuthority()); }

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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
