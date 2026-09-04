import { mkdir, unlink, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

export function createCheckpointService({ rootDir }) {
  const path = join(rootDir, 'estado', 'checkpoint.json');
  return { async save(input = {}) { await mkdir(join(rootDir, 'estado'), { recursive: true }); const value = { updatedAt: new Date().toISOString(), ...input }; const temp = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(value, null, 2), 'utf8'); await rename(temp, path); return value; }, async clear() { try { await unlink(path); } catch (error) { if (error?.code !== 'ENOENT') throw error; } return { cleared: true }; } };
}
