import { createHash, randomUUID } from 'node:crypto';
import { createStateDocument } from './state-document.mjs';

export function createNotificationService({ rootDir, persistence, now = () => new Date() } = {}) {
  const documento = createStateDocument({ rootDir, persistence, name: 'notifications', file: 'estado/notificacoes.json', fallback: { known: {}, items: [] } });
  const read = async () => normalizar(await documento.read());
  const write = (valor) => documento.write(valor);

  return {
    close() { documento.close(); },

    async notify({ reference = '', type = '', kind = '', title = '', message = '', body = '', action = '', nextAction = '', timezone = 'America/Sao_Paulo' } = {}) {
      const state = await read();
      const texto = message || title || body;
      const categoria = type || kind;
      // Deduplicação por conteúdo: a mesma novidade não vira dois avisos.
      const fingerprint = createHash('sha256').update(`${reference}|${categoria}|${texto}`).digest('hex');
      if (state.known[fingerprint]) return { created: false, notification: state.known[fingerprint] };
      const notification = {
        id: randomUUID(),
        reference,
        type: categoria,
        title: title || texto,
        message: texto,
        body: body || '',
        action: action || nextAction || '',
        nextAction: nextAction || action || '',
        timezone,
        createdAt: now().toISOString(),
        read: false
      };
      state.known[fingerprint] = notification;
      state.items.unshift(notification);
      await write(state);
      return { created: true, notification };
    },

    async open(id) {
      const state = await read();
      const item = state.items.find((entry) => entry.id === id);
      if (!item) return null;
      item.read = true;
      await write(state);
      return { ...item, href: `#candidaturas?ref=${encodeURIComponent(item.reference)}` };
    },

    async list() { return (await read()).items; },
    async authority() { return documento.authority(); }
  };
}

function normalizar(valor) {
  return {
    known: valor?.known && typeof valor.known === 'object' && !Array.isArray(valor.known) ? valor.known : {},
    items: Array.isArray(valor?.items) ? valor.items : []
  };
}
