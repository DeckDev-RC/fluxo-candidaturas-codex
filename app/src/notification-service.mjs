import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';

export function createNotificationService({ rootDir, now = () => new Date() } = {}) {
  return {
    async notify({ reference = '', type = '', message = '', action = '', timezone = 'America/Sao_Paulo' } = {}) {
      const state = await read(rootDir);
      const fingerprint = createHash('sha256').update(`${reference}|${type}|${message}`).digest('hex');
      if (state.known[fingerprint]) return { created: false, notification: state.known[fingerprint] };
      const notification = {
        id: randomUUID(),
        reference,
        type,
        message,
        action,
        timezone,
        createdAt: now().toISOString(),
        read: false
      };
      state.known[fingerprint] = notification;
      state.items.unshift(notification);
      await write(rootDir, state);
      return { created: true, notification };
    },

    async open(id) {
      const state = await read(rootDir);
      const item = state.items.find((entry) => entry.id === id);
      if (!item) return null;
      item.read = true;
      await write(rootDir, state);
      return { ...item, href: `#applications?ref=${encodeURIComponent(item.reference)}` };
    },

    async list() { return (await read(rootDir)).items; }
  };
}

async function read(rootDir) {
  try { return JSON.parse(await readFile(join(rootDir, 'estado', 'notificacoes.json'), 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return { known: {}, items: [] }; throw error; }
}

async function write(rootDir, value) {
  const path = join(rootDir, 'estado', 'notificacoes.json');
  await mkdir(join(rootDir, 'estado'), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await rename(temp, path);
}
