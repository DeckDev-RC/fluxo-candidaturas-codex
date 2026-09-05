import { createDomainError } from './domain/errors.mjs';
import { createStateDocument } from './state-document.mjs';

export function createSchedulerService({ rootDir, persistence, now = () => new Date(), minIntervalMs = 30 * 60 * 1000 } = {}) {
  const documento = createStateDocument({ rootDir, persistence, name: 'schedule', file: 'estado/agenda.json', fallback: { jobs: {} } });
  const read = async () => normalizar(await documento.read());
  const write = (valor) => documento.write(valor);

  return {
    close() { documento.close(); },
    async schedule({ id = 'followup', intervalMs = minIntervalMs, payload = {} } = {}) {
      const state = await read();
      const interval = Math.max(Number(intervalMs) || minIntervalMs, minIntervalMs);
      state.jobs[id] = { id, intervalMs: interval, payload, nextAt: new Date(now().getTime() + interval).toISOString(), lastStartedAt: '', running: false };
      await write(state);
      return state.jobs[id];
    },

    async due() {
      const state = await read();
      const timestamp = now();
      return Object.values(state.jobs).filter((job) => !job.running && Date.parse(job.nextAt) <= timestamp.getTime());
    },

    async begin(id) {
      const state = await read();
      const job = state.jobs[id];
      if (!job) throw createDomainError('schedule_not_found', 'Agenda não encontrada.');
      if (job.running) throw createDomainError('schedule_overlap', 'Uma consulta já está em andamento.');
      job.running = true;
      job.lastStartedAt = now().toISOString();
      await write(state);
      return job;
    },

    async finish(id, { skipAdvance = false } = {}) {
      const state = await read();
      const job = state.jobs[id];
      if (!job) return null;
      job.running = false;
      if (!skipAdvance) job.nextAt = new Date(now().getTime() + job.intervalMs).toISOString();
      await write(state);
      return job;
    },

    // Cancelar é decisão da pessoa: a agenda some e nenhuma consulta nova é disparada.
    async remove(id) {
      const state = await read();
      if (!state.jobs[id]) throw createDomainError('schedule_not_found', 'Agenda não encontrada.');
      delete state.jobs[id];
      await write(state);
      return { id, removed: true };
    },

    async list() { return Object.values((await read()).jobs); },
    async authority() { return documento.authority(); }
  };
}

function normalizar(valor) {
  return { jobs: valor?.jobs && typeof valor.jobs === 'object' && !Array.isArray(valor.jobs) ? valor.jobs : {} };
}
