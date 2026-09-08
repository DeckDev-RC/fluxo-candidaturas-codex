import { copyFile, mkdir, unlink, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { acquireFluxoLock, wrapMutations } from './lock.mjs';

export function createCheckpointService({ rootDir, mutationLock = true, lock = () => acquireFluxoLock(rootDir) }) {
  const path = join(rootDir, 'estado', 'checkpoint.json');
  const service = { async save(input = {}) { await mkdir(join(rootDir, 'estado'), { recursive: true }); await copyFile(path, `${path}.bak`).catch((error) => { if (error?.code !== 'ENOENT') throw error; }); const value = { updatedAt: new Date().toISOString(), ...input }; const temp = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(value, null, 2), 'utf8'); await rename(temp, path); return value; }, async clear() { try { await unlink(path); } catch (error) { if (error?.code !== 'ENOENT') throw error; } return { cleared: true }; } };
  return wrapMutations(service, ['save', 'clear'], { rootDir, mutationLock, lock });
}
