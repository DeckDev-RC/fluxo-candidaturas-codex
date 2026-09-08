import { createHash } from 'node:crypto';
import { readFluxoState } from './state-reader.mjs';
import { createStateDocument } from './state-document.mjs';

export function createFollowUpMonitor({ rootDir = '', persistence, adapters = {}, now = () => new Date() } = {}) {
  const documento = createStateDocument({ rootDir, persistence, name: 'followup', file: 'estado/followup.json', fallback: { known: {}, events: [], checkedAt: '' } });
  return {
    close() { documento.close(); },
    async authority() { return documento.authority(); },
    async check({ applications = [], platforms = [], instruction = '' } = {}) {
      const state = await readState(documento);
      const requestedApplications = applications.length ? applications : (await readFluxoState(rootDir)).applications.items;
      const selected = platforms.length ? platforms.map((value) => String(value).toUpperCase()) : [...new Set(requestedApplications.map((item) => String(item.platform ?? '').toUpperCase()).filter(Boolean))];
      const newEvents = []; const failures = [];
      for (const application of requestedApplications) {
        const platform = String(application.platform ?? '').toUpperCase();
        if (!selected.includes(platform)) continue;
        const adapter = adapters[platform];
        if (!adapter?.status) { failures.push({ reference: application.id ?? application.key, platform, type: 'unsupported', retryable: false, message: 'Monitor da plataforma não configurado.' }); continue; }
        try {
          const events = await adapter.status(application, { instruction });
          for (const raw of Array.isArray(events) ? events : []) {
            const event = normalizeEvent(raw, application, platform, now);
            const fingerprint = event.id || createHash('sha256').update(JSON.stringify([event.reference, event.type, event.status, event.note])).digest('hex');
            if (state.known[fingerprint]) continue;
            state.known[fingerprint] = event.occurredAt;
            newEvents.push(event);
          }
        } catch { failures.push({ reference: application.id ?? application.key, platform, type: 'unavailable', retryable: true, message: `Não foi possível consultar ${platform}.` }); }
      }
      state.checkedAt = now().toISOString();
      state.events = [...state.events, ...newEvents].slice(-500);
      await writeState(documento, state);
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
async function readState(documento) {
  const value = await documento.read();
  return { known: value?.known ?? {}, events: Array.isArray(value?.events) ? value.events : [], checkedAt: value?.checkedAt ?? '' };
}
async function writeState(documento, value) { return documento.write(value); }
