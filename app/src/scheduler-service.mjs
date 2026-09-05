import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDomainError } from './domain/errors.mjs';

export function createSchedulerService({ rootDir, now = () => new Date(), minIntervalMs = 30 * 60 * 1000 } = {}) {
  return {
    async schedule({ id = 'followup', intervalMs = minIntervalMs, payload = {} } = {}) {
      const state = await read(rootDir);
      const interval = Math.max(Number(intervalMs) || minIntervalMs, minIntervalMs);
      state.jobs[id] = { id, intervalMs: interval, payload, nextAt: new Date(now().getTime() + interval).toISOString(), lastStartedAt: '', running: false };
      await write(rootDir, state);
      return state.jobs[id];
    },

    async due() {
      const state = await read(rootDir);
      const timestamp = now();
      return Object.values(state.jobs).filter((job) => !job.running && Date.parse(job.nextAt) <= timestamp.getTime());
    },

    async begin(id) {
      const state = await read(rootDir);
      const job = state.jobs[id];
      if (!job) throw createDomainError('schedule_not_found', 'Agenda não encontrada.');
      if (job.running) throw createDomainError('schedule_overlap', 'Uma consulta já está em andamento.');
      job.running = true;
      job.lastStartedAt = now().toISOString();
      await write(rootDir, state);
      return job;
    },

    async finish(id, { skipAdvance = false } = {}) {
      const state = await read(rootDir);
      const job = state.jobs[id];
      if (!job) return null;
      job.running = false;
      if (!skipAdvance) job.nextAt = new Date(now().getTime() + job.intervalMs).toISOString();
      await write(rootDir, state);
      return job;
    },

    async list() { return Object.values((await read(rootDir)).jobs); }
  };
}

async function read(rootDir) {
  try { return JSON.parse(await readFile(join(rootDir, 'estado', 'agenda.json'), 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return { jobs: {} }; throw error; }
}

async function write(rootDir, value) {
  const path = join(rootDir, 'estado', 'agenda.json');
  await mkdir(join(rootDir, 'estado'), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await rename(temp, path);
}
