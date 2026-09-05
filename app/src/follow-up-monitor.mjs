import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFluxoState } from './state-reader.mjs';

export function createFollowUpMonitor({ rootDir = '', adapters = {}, now = () => new Date() } = {}) {
  return {
    async check({ applications = [], platforms = [], instruction = '' } = {}) {
      const state = await readState(rootDir);
      const requestedApplications = applications.length ? applications : (await readFluxoState(rootDir)).applications.items;
      const selected = platforms.length ? platforms.map((value) => String(value).toUpperCase()) : [...new Set(requestedApplications.map((item) => String(item.platform ?? '').toUpperCase()).filter(Boolean))];
      const newEvents = []; const failures = [];
      for (const application of requestedApplications) {
        const platform = String(application.platform ?? '').toUpperCase();
        if (!selected.includes(platform)) continue;
        const adapter = adapters[platform];
        if (!adapter?.status) { failures.push({ reference: application.id ?? application.key, platform, retryable: true, message: 'Monitor da plataforma não configurado.' }); continue; }
        try {
          const events = await adapter.status(application, { instruction });
          for (const raw of Array.isArray(events) ? events : []) {
            const event = normalizeEvent(raw, application, platform, now);
            const fingerprint = event.id || createHash('sha256').update(JSON.stringify([event.reference, event.type, event.status, event.note])).digest('hex');
            if (state.known[fingerprint]) continue;
            state.known[fingerprint] = event.occurredAt;
            newEvents.push(event);
          }
        } catch { failures.push({ reference: application.id ?? application.key, platform, retryable: true, message: `Não foi possível consultar ${platform}.` }); }
      }
      state.checkedAt = now().toISOString();
      state.events = [...state.events, ...newEvents].slice(-500);
      await writeState(rootDir, state);
      const alerts = newEvents.filter((event) => ['entrevista', 'teste', 'prazo', 'convite'].some((term) => `${event.type} ${event.status}`.toLocaleLowerCase().includes(term))).map((event) => ({ ...event, priority: 'alta' }));
      const missingAdapter = failures.some((item) => /não configurado/i.test(item.message));
      const summary = missingAdapter
        ? 'Há plataformas sem adaptador de acompanhamento; isso não significa ausência de novidades.'
        : newEvents.length ? `${newEvents.length} novidade(s) encontrada(s) no acompanhamento.` : 'Nenhuma novidade desde a última consulta.';
      return { checkedAt: state.checkedAt, newEvents, alerts, failures, instruction: String(instruction), summary, nextActions: newEvents.map((event) => ({ reference: event.reference, action: event.nextAction, deadline: event.deadline })) };
    }
  };
}

function normalizeEvent(raw, application, platform, now) { const occurredAt = String(raw.occurredAt ?? now().toISOString()); return { id: String(raw.id ?? ''), reference: String(raw.reference ?? application.id ?? application.key ?? ''), company: String(application.company ?? ''), role: String(application.role ?? ''), platform, type: String(raw.type ?? 'status'), status: String(raw.status ?? ''), note: String(raw.note ?? ''), nextAction: String(raw.nextAction ?? 'Acompanhar novamente'), deadline: String(raw.deadline ?? ''), source: platform, evidence: String(raw.evidence ?? ''), occurredAt }; }
async function readState(rootDir) { try { const value = JSON.parse(await readFile(join(rootDir, 'estado', 'followup.json'), 'utf8')); return { known: value.known ?? {}, events: Array.isArray(value.events) ? value.events : [], checkedAt: value.checkedAt ?? '' }; } catch (error) { if (error?.code === 'ENOENT') return { known: {}, events: [], checkedAt: '' }; throw error; } }
async function writeState(rootDir, value) { const path = join(rootDir, 'estado', 'followup.json'); await mkdir(join(rootDir, 'estado'), { recursive: true }); const temp = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(value, null, 2), 'utf8'); await rename(temp, path); }
async function readApplications(rootDir) { try { const value = JSON.parse(await readFile(join(rootDir, 'candidaturas', 'candidaturas.json'), 'utf8')); return Array.isArray(value) ? value : []; } catch (error) { if (error?.code === 'ENOENT') return []; throw error; } }
