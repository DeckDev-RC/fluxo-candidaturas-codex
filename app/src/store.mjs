import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readFluxoState } from './state-reader.mjs';

const OPERATIONAL_FILES = [
  'estado/preflight.json',
  'campanha/config.json',
  'fila/vagas.json',
  'candidaturas/candidaturas.json',
  'estado/checkpoint.json'
];

export function createStore({ rootDir, dbPath }) {
  const database = new DatabaseSync(dbPath);
  database.exec(`
    pragma foreign_keys = on;
    create table if not exists state_documents (
      name text primary key,
      payload_json text not null,
      updated_at text not null
    );
    create table if not exists file_revisions (
      path text primary key,
      content_hash text not null,
      updated_at text not null
    );
    create table if not exists runs (
      id text primary key,
      kind text not null,
      status text not null,
      platform text,
      queue_reference text,
      checkpoint_path text,
      agent_thread_id text,
      current_turn_id text,
      started_at text not null,
      updated_at text not null,
      finished_at text
    );
    create table if not exists operations (
      id text primary key,
      run_id text,
      kind text not null,
      script_name text,
      input_json text not null,
      status text not null,
      exit_code integer,
      result_json text,
      safe_output text,
      before_hash text,
      after_hash text,
      started_at text not null,
      finished_at text
    );
    create table if not exists queue_items (
      id text primary key,
      item_key text not null unique,
      fingerprint text,
      platform text not null,
      company text not null,
      role text not null,
      identifier_or_url text not null,
      priority text not null,
      fit_score real,
      status text not null,
      attempts integer not null default 0,
      failure_count integer not null default 0,
      deadline text,
      source text,
      work_mode text,
      notes text,
      last_error text,
      added_at text,
      updated_at text
    );
    create table if not exists applications (
      id text primary key,
      queue_item_id text,
      item_key text not null unique,
      fingerprint text,
      platform text not null,
      company text not null,
      role text not null,
      identifier_or_url text not null,
      status text not null,
      submitted_at text,
      applied_at text,
      candidate_id text,
      resume_path text,
      work_mode text,
      next_action text,
      next_action_at text,
      deadline text,
      last_checked_at text,
      evidence_path text,
      evidence_json text not null,
      notes text,
      source text,
      history_json text not null,
      assessment_json text,
      created_at text,
      updated_at text
    );
    create table if not exists approvals (
      id text primary key,
      run_id text not null,
      kind text not null,
      payload_hash text not null,
      status text not null,
      decided_by text,
      expires_at text,
      created_at text not null,
      decided_at text
    );
    create table if not exists domain_events (
      id text primary key,
      run_id text,
      aggregate_type text not null,
      aggregate_id text not null,
      type text not null,
      payload_json text not null,
      actor_type text not null,
      created_at text not null,
      idempotency_key text unique
    );
    create table if not exists failures (
      id text primary key,
      run_id text,
      queue_item_id text,
      category text not null,
      message_safe text not null,
      retryable integer not null,
      attempt integer not null,
      created_at text not null
    );
  `);
  ensureColumn(database, 'operations', 'aggregate_type', 'text');
  ensureColumn(database, 'operations', 'aggregate_id', 'text');
  ensureColumn(database, 'operations', 'blocked', 'integer not null default 0');

  return {
    async syncFromFiles() {
      const state = await readFluxoState(rootDir);
      const revisions = await readRevisions(rootDir);
      const previous = database.prepare('select path, content_hash from file_revisions').all();
      const previousByPath = new Map(previous.map((row) => [row.path, row.content_hash]));
      const divergences = revisions
        .filter((revision) => previousByPath.has(revision.path) && previousByPath.get(revision.path) !== revision.contentHash)
        .map((revision) => revision.path);
      const now = new Date().toISOString();

      database.exec('begin');
      try {
        database.prepare('delete from queue_items').run();
        database.prepare('delete from applications').run();

        const queueInsert = database.prepare(`insert into queue_items
          (id, item_key, fingerprint, platform, company, role, identifier_or_url, priority, fit_score, status, attempts, failure_count, deadline, source, work_mode, notes, last_error, added_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const item of state.queue.items) {
          queueInsert.run(
            item.id ?? '', item.key ?? item.identifierOrUrl ?? item.id ?? '', item.fingerprint ?? null,
            item.platform ?? '', item.company ?? '', item.role ?? '', item.identifierOrUrl ?? '', item.priority ?? 'B',
            item.fitScore ?? null, item.status ?? 'na fila', item.attempts ?? 0, item.failureCount ?? 0,
            item.deadline ?? '', item.source ?? '', item.workMode ?? '', item.notes ?? '', item.lastError ?? '',
            item.addedAt ?? '', item.updatedAt ?? ''
          );
        }

        const applicationInsert = database.prepare(`insert into applications
          (id, queue_item_id, item_key, fingerprint, platform, company, role, identifier_or_url, status, submitted_at, applied_at, candidate_id, resume_path, work_mode, next_action, next_action_at, deadline, last_checked_at, evidence_path, evidence_json, notes, source, history_json, assessment_json, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const item of state.applications.items) {
          applicationInsert.run(
            item.id ?? '', item.queueItemId ?? null, item.key ?? item.identifierOrUrl ?? item.id ?? '', item.fingerprint ?? null,
            item.platform ?? '', item.company ?? '', item.role ?? '', item.identifierOrUrl ?? '', item.status ?? 'rascunho',
            item.submittedAt ?? '', item.appliedAt ?? '', item.applicationId ?? '', item.resume ?? '', item.workMode ?? '',
            item.nextAction ?? '', item.nextActionAt ?? '', item.deadline ?? '', item.lastCheckedAt ?? '', item.evidencePath ?? '',
            JSON.stringify(item.evidence ?? []), item.notes ?? '', item.source ?? '', JSON.stringify(item.history ?? []),
            item.assessment ? JSON.stringify(item.assessment) : null, item.createdAt ?? '', item.updatedAt ?? ''
          );
        }

        database.prepare(`insert into state_documents (name, payload_json, updated_at) values ('snapshot', ?, ?)
          on conflict(name) do update set payload_json=excluded.payload_json, updated_at=excluded.updated_at`).run(JSON.stringify(state), now);
        const revisionInsert = database.prepare(`insert into file_revisions (path, content_hash, updated_at) values (?, ?, ?)
          on conflict(path) do update set content_hash=excluded.content_hash, updated_at=excluded.updated_at`);
        for (const revision of revisions) revisionInsert.run(revision.path, revision.contentHash, now);
        database.exec('commit');
      } catch (error) {
        database.exec('rollback');
        throw error;
      }

      return { state: this.getSnapshot(), divergences };
    },

    getSnapshot() {
      const row = database.prepare("select payload_json from state_documents where name = 'snapshot'").get();
      return row ? JSON.parse(row.payload_json) : emptySnapshot();
    },

    startOperation({ kind, aggregateType = '', aggregateId = '', input = {}, beforeHash = '' }) {
      const id = cryptoRandomId();
      const startedAt = new Date().toISOString();
      database.prepare(`insert into operations (id, kind, aggregate_type, aggregate_id, input_json, status, before_hash, safe_output, started_at)
        values (?, ?, ?, ?, ?, 'pending', ?, '', ?)`).run(id, kind, aggregateType, aggregateId, JSON.stringify(input), beforeHash, startedAt);
      return { id, kind, aggregateType, aggregateId, status: 'pending', beforeHash, startedAt };
    },

    updateOperation(id, patch) {
      const fields = { status: 'status', afterHash: 'after_hash', result: 'result_json', error: 'safe_output', finishedAt: 'finished_at', blocked: 'blocked' };
      const entries = Object.entries(patch).filter(([key]) => fields[key]);
      if (entries.length) {
        for (const [key] of entries) {
          const value = key === 'result' ? JSON.stringify(patch[key]) : key === 'blocked' ? (patch[key] ? 1 : 0) : patch[key] ?? null;
          database.prepare(`update operations set ${fields[key]} = ? where id = ?`).run(value, String(id));
        }
      }
      return this.getOperation(id);
    },

    getOperation(id) {
      const row = database.prepare('select * from operations where id = ?').get(id);
      return row ? toOperation(row) : null;
    },

    listOperations() { return database.prepare('select * from operations order by started_at desc').all().map(toOperation); },

    isAggregateBlocked(aggregateType, aggregateId) {
      return Boolean(database.prepare("select 1 from operations where aggregate_type = ? and aggregate_id = ? and blocked = 1 and status = 'needs_reconcile' limit 1").get(aggregateType, aggregateId));
    },

    close() {
      database.close();
    }
  };
}

function ensureColumn(database, table, column, definition) {
  const columns = database.prepare(`pragma table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) database.exec(`alter table ${table} add column ${column} ${definition}`);
}

function cryptoRandomId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }

function toOperation(row) {
  let result = null;
  try { result = row.result_json ? JSON.parse(row.result_json) : null; } catch { result = null; }
  return { id: row.id, kind: row.kind, aggregateType: row.aggregate_type ?? '', aggregateId: row.aggregate_id ?? '', status: row.status, beforeHash: row.before_hash ?? '', afterHash: row.after_hash ?? '', result, error: row.safe_output ?? '', blocked: row.blocked === 1, startedAt: row.started_at, finishedAt: row.finished_at ?? '' };
}

async function readRevisions(rootDir) {
  const revisions = [];
  for (const relativePath of OPERATIONAL_FILES) {
    try {
      const content = await readFile(join(rootDir, relativePath));
      revisions.push({ path: relativePath, contentHash: createHash('sha256').update(content).digest('hex') });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return revisions;
}

function emptySnapshot() {
  return {
    installation: { ready: false, status: 'blocked' },
    preflight: { ready: false, checks: [] },
    campaign: { platforms: [], totalGoal: 0, dailyGoal: 0, weeklyGoal: 0 },
    queue: { items: [], counts: {} },
    applications: { items: [], counts: {}, confirmedCount: 0 },
    checkpoint: null
  };
}
