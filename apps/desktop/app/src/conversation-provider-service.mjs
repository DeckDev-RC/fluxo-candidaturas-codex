import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FILE = 'estado/ia-preferences.json';
const PROVIDERS = ['skynet', 'codex'];
export const SKYNET_CONSENT_VERSION = 'v1';

export function createConversationProviderService({ rootDir = '', fallback = 'skynet', now = () => new Date() } = {}) {
  let active = valid(fallback) ? fallback : 'skynet';
  let source = 'default';
  let consents = {};
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
        consents = normalizeConsents(saved.consents);
      } catch { /* primeira execução ou preferência inválida usa fallback */ }
      return this.snapshot();
    },

    get() { return active; },

    snapshot() {
      return { activeProvider: active, availableProviders: [...PROVIDERS], source, consents: publicConsents(consents) };
    },

    async set(provider) {
      const next = String(provider ?? '').toLowerCase();
      if (!valid(next)) throw domainError('conversation_provider_invalid', 'Escolha SkynetChat ou ChatGPT/Codex.');
      if (next === active && source === 'user') return this.snapshot();
      await persist(rootDir, document(next, consents, now()));
      active = next;
      source = 'user';
      return notify();
    },

    hasConsent(provider, version = SKYNET_CONSENT_VERSION) {
      const consent = consents[String(provider ?? '')];
      return consent?.version === version && Boolean(consent.acceptedAt);
    },

    async grantConsent(provider, version = SKYNET_CONSENT_VERSION) {
      const name = String(provider ?? '').toLowerCase();
      if (!valid(name) || version !== SKYNET_CONSENT_VERSION) throw domainError('provider_consent_invalid', 'O consentimento do provedor é inválido.');
      const nextConsents = { ...consents, [name]: { version, acceptedAt: now().toISOString() } };
      await persist(rootDir, document(active, nextConsents, now()));
      consents = nextConsents;
      return notify();
    },

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };

  function notify() {
    const value = serviceSnapshot();
    for (const listener of listeners) {
      try { listener(value); } catch { /* observador não bloqueia a escolha */ }
    }
    return value;
  }

  function serviceSnapshot() {
    return { activeProvider: active, availableProviders: [...PROVIDERS], source, consents: publicConsents(consents) };
  }
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
function document(activeProvider, consents, now) { return { activeProvider, consents, updatedAt: now.toISOString() }; }
function normalizeConsents(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(PROVIDERS.flatMap((provider) => {
    const consent = value[provider];
    return consent?.version && consent?.acceptedAt ? [[provider, { version: String(consent.version), acceptedAt: String(consent.acceptedAt) }]] : [];
  }));
}
function publicConsents(consents) {
  return Object.fromEntries(PROVIDERS.map((provider) => [provider, {
    accepted: Boolean(consents[provider]?.acceptedAt),
    version: consents[provider]?.version ?? '',
    acceptedAt: consents[provider]?.acceptedAt ?? ''
  }]));
}
function domainError(code, message) { return Object.assign(new Error(message), { code }); }
