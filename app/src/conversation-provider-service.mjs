import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FILE = 'estado/ia-preferences.json';
const PROVIDERS = ['skynet', 'codex'];

export function createConversationProviderService({ rootDir = '', fallback = 'skynet', now = () => new Date() } = {}) {
  let active = valid(fallback) ? fallback : 'skynet';
  let source = 'default';
  let loaded = false;
  const listeners = new Set();

  return {
    async load() {
      if (loaded) return this.snapshot();
      loaded = true;
      if (!rootDir) return this.snapshot();
      try {
        const saved = JSON.parse(await readFile(join(rootDir, FILE), 'utf8'));
        if (valid(saved.activeProvider)) {
          active = saved.activeProvider;
          source = 'user';
        }
      } catch { /* primeira execução ou preferência inválida usa fallback */ }
      return this.snapshot();
    },

    get() { return active; },

    snapshot() {
      return { activeProvider: active, availableProviders: [...PROVIDERS], source };
    },

    async set(provider) {
      const next = String(provider ?? '').toLowerCase();
      if (!valid(next)) throw domainError('conversation_provider_invalid', 'Escolha SkynetChat ou ChatGPT/Codex.');
      if (next === active && source === 'user') return this.snapshot();
      await persist(rootDir, { activeProvider: next, updatedAt: now().toISOString() });
      active = next;
      source = 'user';
      const value = this.snapshot();
      for (const listener of listeners) {
        try { listener(value); } catch { /* observador não bloqueia a escolha */ }
      }
      return value;
    },

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

async function persist(rootDir, value) {
  if (!rootDir) return;
  const directory = join(rootDir, 'estado');
  const target = join(rootDir, FILE);
  const temporary = `${target}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
  await rename(temporary, target);
}

function valid(value) { return PROVIDERS.includes(value); }
function domainError(code, message) { return Object.assign(new Error(message), { code }); }
