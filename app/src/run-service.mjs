import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export function createRunService({ dbPath, maxApplicationsPerRun = 30, now = () => new Date() }) {
  const database = new DatabaseSync(dbPath);
  const subscribers = new Map();
  database.exec(`
    create table if not exists runs (
      id text primary key,
      kind text not null,
      status text not null,
      platform text,
      queue_reference text,
      checkpoint_path text,
      agent_thread_id text,
      current_turn_id text,
      goal text not null default '',
      mode text not null default 'manual',
      current_task text not null default '',
      plan_json text not null default '[]',
      last_observation text not null default '',
      tool text not null default '',
      result_json text,
      submitted_count integer not null default 0,
      started_at text not null,
      updated_at text not null,
      finished_at text
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
  `);
  ensureColumn(database, 'runs', 'submitted_count', 'integer not null default 0');
  for (const [column, definition] of [['goal', "text not null default ''"], ['mode', "text not null default 'manual'"], ['current_task', "text not null default ''"], ['plan_json', "text not null default '[]'"], ['last_observation', "text not null default ''"], ['tool', "text not null default ''"], ['result_json', 'text']]) ensureColumn(database, 'runs', column, definition);
  database.exec(`create table if not exists run_subtasks (id text primary key, run_id text not null, parent_task text, status text not null, result_json text, created_at text not null)`);

  return {
    startRun({ kind, platform = '', queueReference = '', goal = '', mode = 'manual' }) {
      const timestamp = now().toISOString();
      const run = {
        id: randomUUID(), kind, status: 'running', platform, queueReference, goal: String(goal), mode: String(mode),
        startedAt: timestamp, updatedAt: timestamp
      };
      database.prepare(`insert into runs
        (id, kind, status, platform, queue_reference, started_at, updated_at, goal, mode)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(run.id, run.kind, run.status, run.platform, run.queueReference, run.startedAt, run.updatedAt, run.goal, run.mode);
      return run;
    },

    getRun(id) {
      const row = database.prepare('select * from runs where id = ?').get(id);
      return row ? toRun(row) : null;
    },
    listRuns() { return database.prepare('select * from runs order by started_at asc').all().map(toRun); },

    assertCanSubmit(id, submittedCount) {
      const run = this.getRun(id);
      if (!run) throw domainError('run_not_found', 'Execução não encontrada.');
      if (Number(submittedCount ?? run.submittedCount) >= maxApplicationsPerRun) {
        throw domainError('run_application_limit_reached', 'O limite de candidaturas desta execução foi atingido.');
      }
      return true;
    },

    recordSubmission(id) {
      const run = this.getRun(id);
      if (!run) throw domainError('run_not_found', 'Execução não encontrada.');
      this.assertCanSubmit(id, run.submittedCount);
      database.prepare('update runs set submitted_count = submitted_count + 1, updated_at = ? where id = ?').run(now().toISOString(), id);
      return this.getRun(id);
    },

    setAgentThread(id, threadId) { return updateRunFields(id, { agent_thread_id: String(threadId) }); },
    setCurrentTurn(id, turnId) { return updateRunFields(id, { current_turn_id: String(turnId) }); },

    setPlan(id, plan) { return updateRunFields(id, { plan_json: JSON.stringify(plan) }); },
    recordTask(id, { task = '', observation = '', tool = '', result = null } = {}) { return updateRunFields(id, { current_task: String(task), last_observation: String(observation), tool: String(tool), result_json: result == null ? null : JSON.stringify(result) }); },
    addSubtask(id, { id: subtaskId = randomUUID(), parentTask = '', status = 'pending', result = null } = {}) { database.prepare('insert into run_subtasks (id, run_id, parent_task, status, result_json, created_at) values (?, ?, ?, ?, ?, ?)').run(subtaskId, id, parentTask, status, result == null ? null : JSON.stringify(result), now().toISOString()); return this.listSubtasks(id).at(-1); },
    listSubtasks(id) { return database.prepare('select * from run_subtasks where run_id = ? order by created_at asc').all(id).map((row) => ({ id: row.id, runId: row.run_id, parentTask: row.parent_task ?? '', status: row.status, result: parseJson(row.result_json), createdAt: row.created_at })); },
    finishRun(id, status = 'succeeded', reason = '') { const updated = updateRun(id, status, reason); return { ...updated, finishedAt: now().toISOString() }; },

    appendEvent({ runId = '', type, aggregateType = 'run', aggregateId = runId, payload = {}, actorType = 'system', idempotencyKey = '' }) {
      if (idempotencyKey) {
        const existing = database.prepare('select * from domain_events where idempotency_key = ?').get(idempotencyKey);
        if (existing) return toEvent(existing);
      }
      const event = {
        id: randomUUID(), runId, aggregateType, aggregateId, type,
        payloadJson: JSON.stringify(payload), actorType, createdAt: now().toISOString(), idempotencyKey: idempotencyKey || null
      };
      database.prepare(`insert into domain_events
        (id, run_id, aggregate_type, aggregate_id, type, payload_json, actor_type, created_at, idempotency_key)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(event.id, event.runId, event.aggregateType, event.aggregateId, event.type, event.payloadJson, event.actorType, event.createdAt, event.idempotencyKey);
      for (const listener of subscribers.get(runId) ?? []) listener(event);
      return event;
    },

    listEvents(runId) {
      return database.prepare('select * from domain_events where run_id = ? order by created_at asc').all(runId).map(toEvent);
    },

    subscribe(runId, listener) {
      if (!subscribers.has(runId)) subscribers.set(runId, new Set());
      subscribers.get(runId).add(listener);
      return () => { const listeners = subscribers.get(runId); listeners?.delete(listener); if (listeners?.size === 0) subscribers.delete(runId); };
    },

    pauseRun(id, reason) {
      return updateRun(id, 'paused', reason);
    },

    resumeRun(id) {
      const run = this.getRun(id);
      if (!run) throw domainError('run_not_found', 'Execução não encontrada.');
      if (run.status !== 'paused') throw domainError('run_not_resumable', 'A execução não está pausada.');
      return updateRun(id, 'running', 'retomada pelo usuário');
    },

    reconcile() {
      const running = database.prepare("select id from runs where status = 'running'").all();
      const timestamp = now().toISOString();
      database.prepare("update runs set status = 'needs_reconcile', updated_at = ? where status = 'running'").run(timestamp);
      for (const run of running) {
        this.appendEvent({ runId: run.id, type: 'run.needs_reconcile', payload: { reason: 'processo reiniciado' } });
      }
      return { reconciled: running.length };
    },

    close() {
      database.close();
    }
  };

  function updateRun(id, status, reason) {
    const run = database.prepare('select * from runs where id = ?').get(id);
    if (!run) throw domainError('run_not_found', 'Execução não encontrada.');
    const updatedAt = now().toISOString();
    database.prepare('update runs set status = ?, updated_at = ? where id = ?').run(status, updatedAt, id);
    return { ...toRun(run), status, updatedAt, reason };
  }

  function updateRunFields(id, fields) {
    const run = database.prepare('select * from runs where id = ?').get(id);
    if (!run) throw domainError('run_not_found', 'Execução não encontrada.');
    const updatedAt = now().toISOString();
    database.prepare(`update runs set ${Object.keys(fields).map((field) => `${field} = ?`).join(', ')}, updated_at = ? where id = ?`).run(...Object.values(fields), updatedAt, id);
    return toRun(database.prepare('select * from runs where id = ?').get(id));
  }
}

function toRun(row) {
  const plan = parseJson(row.plan_json) ?? [];
  const result = parseJson(row.result_json);
  return {
    id: row.id, kind: row.kind, status: row.status, platform: row.platform ?? '',
    queueReference: row.queue_reference ?? '', checkpointPath: row.checkpoint_path ?? '',
    agentThreadId: row.agent_thread_id ?? '', currentTurnId: row.current_turn_id ?? '', submittedCount: row.submitted_count ?? 0,
    goal: row.goal ?? '', mode: row.mode ?? 'manual', currentTask: row.current_task ?? '', plan, lastObservation: row.last_observation ?? '', tool: row.tool ?? '', result,
    startedAt: row.started_at, updatedAt: row.updated_at, finishedAt: row.finished_at ?? ''
  };
}

function parseJson(value) { try { return value ? JSON.parse(value) : null; } catch { return null; } }

function toEvent(row) {
  return {
    id: row.id, runId: row.run_id, aggregateType: row.aggregate_type, aggregateId: row.aggregate_id,
    type: row.type, payloadJson: row.payload_json, actorType: row.actor_type,
    createdAt: row.created_at, idempotencyKey: row.idempotency_key
  };
}

function ensureColumn(database, table, column, definition) {
  const columns = database.prepare(`pragma table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) database.exec(`alter table ${table} add column ${column} ${definition}`);
}

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
