import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { copyFile, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const LEGACY_DOCUMENTS = [
  { name: 'campaign', path: 'campanha/config.json', fallback: { platforms: [] }, kind: 'object' },
  { name: 'queue', path: 'fila/vagas.json', fallback: [], kind: 'array' },
  { name: 'applications', path: 'candidaturas/candidaturas.json', fallback: [], kind: 'array' }
];
const CURRENT_SCHEMA_VERSION = 1;

/**
 * SQLite is deliberately opt-in for existing Fluxo roots.  Call migrateLegacy()
 * once for a JSON root, or initializeNewFluxoPersistence() for a new root.
 */
export function createPersistenceAuthority({ rootDir, dbPath = join(rootDir, 'estado', 'fluxo.sqlite'), now = () => new Date() } = {}) {
  if (!rootDir) throw codedError('persistence_root_required', 'rootDir é obrigatório para a persistência SQLite.');
  mkdirSync(dirname(dbPath), { recursive: true });
  const database = new DatabaseSync(dbPath);
  applyMigrations(database);

  const document = (name) => LEGACY_DOCUMENTS.find((item) => item.name === name);
  const meta = (key) => database.prepare('select value from persistence_meta where key = ?').get(key)?.value ?? null;
  const setMeta = (key, value) => database.prepare(`insert into persistence_meta (key, value) values (?, ?)
    on conflict(key) do update set value = excluded.value`).run(key, String(value));
  const isSqlite = () => meta('authority') === 'sqlite';

  function requireSqlite() {
    if (!isSqlite()) throw codedError('persistence_not_initialized', 'SQLite ainda não é a autoridade deste diretório. Inicialize uma raiz nova ou execute a migração explícita.');
  }
  function readDocument(name) {
    requireSqlite();
    const definition = document(name);
    const row = database.prepare('select payload_json from operational_documents where name = ?').get(name);
    return row ? JSON.parse(row.payload_json) : clone(definition.fallback);
  }
  function saveDocument(name, payload) {
    requireSqlite();
    assertNoDrift();
    validatePayload(document(name), payload);
    database.prepare(`insert into operational_documents (name, payload_json, updated_at) values (?, ?, ?)
      on conflict(name) do update set payload_json = excluded.payload_json, updated_at = excluded.updated_at`)
      .run(name, JSON.stringify(payload), now().toISOString());
    return clone(payload);
  }
  function saveDocuments(values) {
    requireSqlite();
    database.exec('begin immediate');
    try {
      for (const [name, payload] of Object.entries(values)) saveDocument(name, payload);
      database.exec('commit');
    } catch (error) { database.exec('rollback'); throw error; }
  }
  function assertNoDrift() {
    for (const definition of LEGACY_DOCUMENTS) {
      const path = join(rootDir, definition.path);
      const actual = existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
      if (meta(`legacy_hash:${definition.path}`) !== actual) throw codedError('legacy_drift', 'Um JSON de compatibilidade foi alterado. Reconcilie explicitamente antes de continuar.');
    }
  }

  // Documentos de estado da era do aplicativo: nascem no banco e não têm espelho
  // JSON, então não participam da verificação de divergência legada.
  function readRuntimeDocument(name, fallback = {}) {
    requireSqlite();
    const row = database.prepare('select payload_json from runtime_documents where name = ?').get(String(name));
    return row ? JSON.parse(row.payload_json) : clone(fallback);
  }
  function saveRuntimeDocument(name, payload) {
    requireSqlite();
    database.prepare(`insert into runtime_documents (name, payload_json, updated_at) values (?, ?, ?)
      on conflict(name) do update set payload_json = excluded.payload_json, updated_at = excluded.updated_at`)
      .run(String(name), JSON.stringify(payload ?? null), now().toISOString());
    return clone(payload);
  }

  return {
    dbPath,
    assertNoDrift,
    readRuntimeDocument,
    saveRuntimeDocument,
    listRuntimeDocuments() {
      requireSqlite();
      return database.prepare('select name, updated_at from runtime_documents order by name').all().map((row) => ({ name: row.name, updatedAt: row.updated_at }));
    },
    async getMode() { return isSqlite() ? 'sqlite' : 'json'; },
    isSqliteAuthoritySync() { return isSqlite(); },
    async isSqliteAuthority() { return isSqlite(); },
    async initializeNew() {
      if (isSqlite()) return { initialized: false, mode: 'sqlite' };
      const existing = await readLegacyDocuments(rootDir);
      if (existing.present) throw codedError('legacy_data_exists', 'Há dados JSON legados neste diretório. Execute a migração explícita para preservar os dados.');
      database.exec('begin immediate');
      try {
        for (const definition of LEGACY_DOCUMENTS) saveDocumentUnchecked(database, definition.name, definition.fallback, now);
        setMeta('authority', 'sqlite');
        setMeta('authority_version', String(CURRENT_SCHEMA_VERSION));
        database.exec('commit');
      } catch (error) { database.exec('rollback'); throw error; }
      return { initialized: true, mode: 'sqlite' };
    },
    async migrateLegacy() {
      if (isSqlite()) return { migrated: false, mode: 'sqlite', backupDir: meta('migration_backup_dir') ?? '' };
      const legacy = await readLegacyDocuments(rootDir);
      if (!legacy.present) throw codedError('legacy_data_missing', 'Nenhum JSON legado foi encontrado. Para um diretório novo, inicialize SQLite explicitamente.');
      const timestamp = now().toISOString().replace(/[:.]/g, '-');
      const backupDir = join(rootDir, 'estado', 'migration-backups', timestamp);
      await backupLegacyDocuments(rootDir, backupDir, legacy.raw);
      database.exec('begin immediate');
      try {
        for (const definition of LEGACY_DOCUMENTS) saveDocumentUnchecked(database, definition.name, legacy.values[definition.name], now);
        setMeta('authority', 'sqlite');
        setMeta('authority_version', String(CURRENT_SCHEMA_VERSION));
        setMeta('migration_backup_dir', backupDir);
        for (const item of legacy.hashes) setMeta(`legacy_hash:${item.path}`, item.hash);
        database.exec('commit');
      } catch (error) { database.exec('rollback'); throw error; }
      return { migrated: true, mode: 'sqlite', backupDir };
    },
    async getCampaign() { return readDocument('campaign'); },
    async saveCampaign(value) { return saveDocument('campaign', value); },
    async getQueue() { return readDocument('queue'); },
    async replaceQueue(value) { return saveDocument('queue', value); },
    async getApplications() { return readDocument('applications'); },
    async replaceApplications(value) { return saveDocument('applications', value); },
    async replaceQueueAndApplications({ queue, applications }) {
      saveDocuments({ queue, applications });
      return { queue: clone(queue), applications: clone(applications) };
    },
    async getOperationalState() {
      return { campaign: readDocument('campaign'), queue: readDocument('queue'), applications: readDocument('applications') };
    },
    async replaceOperationalState(value) {
      saveDocuments({ campaign: value.campaign, queue: value.queue, applications: value.applications });
      return this.getOperationalState();
    },
    async detectLegacyDrift() {
      if (!isSqlite()) return [];
      const changed = [];
      for (const definition of LEGACY_DOCUMENTS) {
        const expected = meta(`legacy_hash:${definition.path}`);
        const actual = await hashIfPresent(join(rootDir, definition.path));
        if (expected !== actual) changed.push(definition.path);
      }
      return changed;
    },
    async exportCompatibility() {
      requireSqlite();
      const state = await this.getOperationalState();
      const hashes = [];
      for (const definition of LEGACY_DOCUMENTS) {
        const target = join(rootDir, definition.path);
        await mkdir(dirname(target), { recursive: true });
        const temporary = `${target}.${randomUUID()}.tmp`;
        await writeFile(temporary, `${JSON.stringify(state[definition.name], null, 2)}\n`, 'utf8');
        await rename(temporary, target);
        hashes.push({ path: definition.path, hash: await hashIfPresent(target) });
      }
      database.exec('begin immediate');
      try { for (const item of hashes) setMeta(`legacy_hash:${item.path}`, item.hash); database.exec('commit'); } catch (error) { database.exec('rollback'); throw error; }
      return { exported: LEGACY_DOCUMENTS.map((item) => item.path) };
    },
    async reconcileLegacy({ strategy } = {}) {
      requireSqlite();
      const backupDir = join(rootDir, 'estado', 'migration-backups', `reconcile-${now().toISOString().replace(/[:.]/g, '-')}`);
      const originalFiles = [];
      for (const definition of LEGACY_DOCUMENTS) if (existsSync(join(rootDir, definition.path))) originalFiles.push({ path: definition.path });
      await backupLegacyDocuments(rootDir, backupDir, originalFiles);
      if (strategy === 'sqlite_wins') return this.exportCompatibility();
      if (strategy !== 'import_legacy') throw codedError('invalid_reconcile_strategy', 'Use strategy "sqlite_wins" para exportar ou "import_legacy" para importar JSON explicitamente.');
      const legacy = await readLegacyDocuments(rootDir);
      if (!legacy.present) throw codedError('legacy_data_missing', 'Não há JSON legado para reconciliar.');
      database.exec('begin immediate');
      try {
        for (const definition of LEGACY_DOCUMENTS) saveDocumentUnchecked(database, definition.name, legacy.values[definition.name], now);
        for (const item of legacy.hashes) setMeta(`legacy_hash:${item.path}`, item.hash);
        database.exec('commit');
      } catch (error) { database.exec('rollback'); throw error; }
      return { reconciled: 'import_legacy', changed: LEGACY_DOCUMENTS.map((item) => item.path) };
    },
    async rollbackToJson() {
      requireSqlite(); assertNoDrift();
      await this.exportCompatibility();
      setMeta('authority', 'json');
      return { mode: 'json', retainedDatabase: dbPath, exportedCurrentState: true };
    },
    close() { database.close(); }
  };
}

export async function initializeNewFluxoPersistence(options) {
  const authority = createPersistenceAuthority(options);
  try { await authority.initializeNew(); return authority; } catch (error) { authority.close(); throw error; }
}

/** Opens an existing SQLite authority only. Never creates a database or imports JSON. */
export function openAuthoritativePersistence({ rootDir, dbPath = join(rootDir, 'estado', 'fluxo.sqlite') } = {}) {
  if (!existsSync(dbPath)) return null;
  const authority = createPersistenceAuthority({ rootDir, dbPath });
  if (authority.isSqliteAuthoritySync()) return authority;
  authority.close();
  return null;
}

// Resolve authority per operation: a live server adopts an explicitly migrated root without reopening services.
export function createAutoPersistence(options) {
  return new Proxy({ close() {} }, {
    get(target, name) {
      if (name in target) return target[name];
      return async (...args) => {
        const authority = openAuthoritativePersistence(options);
        if (!authority && name === 'isSqliteAuthority') return false;
        if (!authority) throw codedError('persistence_not_initialized', 'Esta raiz ainda usa JSON.');
        try { return await authority[name](...args); } finally { authority.close(); }
      };
    }
  });
}

function applyMigrations(database) {
  database.exec(`create table if not exists schema_migrations (version integer primary key, applied_at text not null);
    create table if not exists persistence_meta (key text primary key, value text not null);
    create table if not exists operational_documents (name text primary key, payload_json text not null, updated_at text not null);
    create table if not exists runtime_documents (name text primary key, payload_json text not null, updated_at text not null);`);
  const exists = database.prepare('select 1 from schema_migrations where version = ?').get(CURRENT_SCHEMA_VERSION);
  if (!exists) database.prepare('insert into schema_migrations (version, applied_at) values (?, ?)').run(CURRENT_SCHEMA_VERSION, new Date().toISOString());
}

async function readLegacyDocuments(rootDir) {
  const values = {}; const raw = []; const hashes = []; let present = false;
  try {
    for (const definition of LEGACY_DOCUMENTS) {
      const path = join(rootDir, definition.path);
      try {
        const content = await readFile(path, 'utf8');
        present = true;
        let value;
        try { value = JSON.parse(content); } catch (error) { throw codedError('legacy_migration_invalid', `JSON legado inválido em ${definition.path}: ${error.message}`); }
        validatePayload(definition, value);
        values[definition.name] = value;
        raw.push({ path: definition.path, content });
        hashes.push({ path: definition.path, hash: hash(content) });
      } catch (error) {
        if (error?.code === 'ENOENT') { values[definition.name] = clone(definition.fallback); continue; }
        throw error;
      }
    }
  } catch (error) { if (!error.code) error.code = 'legacy_migration_invalid'; throw error; }
  return { present, values, raw, hashes };
}

async function backupLegacyDocuments(rootDir, backupDir, files) {
  for (const file of files) {
    const target = join(backupDir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(rootDir, file.path), target);
  }
}

function saveDocumentUnchecked(database, name, payload, now) {
  database.prepare(`insert into operational_documents (name, payload_json, updated_at) values (?, ?, ?)
    on conflict(name) do update set payload_json = excluded.payload_json, updated_at = excluded.updated_at`)
    .run(name, JSON.stringify(payload), now().toISOString());
}
function validatePayload(definition, value) {
  if (definition.kind === 'array' && !Array.isArray(value)) throw codedError('legacy_migration_invalid', `${definition.path} deve conter uma lista JSON.`);
  if (definition.kind === 'object' && (!value || Array.isArray(value) || typeof value !== 'object')) throw codedError('legacy_migration_invalid', `${definition.path} deve conter um objeto JSON.`);
}
async function hashIfPresent(path) { try { return hash(await readFile(path)); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; } }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function codedError(code, message) { const error = new Error(message); error.code = code; return error; }
