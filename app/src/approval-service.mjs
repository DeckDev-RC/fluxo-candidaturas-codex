import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { canTransitionApproval } from './domain/approval-status.mjs';
import { createDomainError } from './domain/errors.mjs';

export function createApprovalService({ dbPath, now = () => new Date() }) {
  const database = new DatabaseSync(dbPath);
  database.exec(`
    create table if not exists approvals (
      id text primary key,
      run_id text not null,
      kind text not null,
      payload_hash text not null,
      payload_json text not null,
      status text not null,
      decided_by text,
      expires_at text not null,
      created_at text not null,
      decided_at text
    );
  `);

  return {
    requestApproval({ runId, kind, payload, ttlMs = 10 * 60 * 1000 }) {
      const createdAt = now();
      const approval = {
        id: randomUUID(), runId, kind, payloadHash: hashPayload(payload), payloadJson: JSON.stringify(payload),
        status: 'pending', expiresAt: new Date(createdAt.getTime() + ttlMs).toISOString(),
        createdAt: createdAt.toISOString(), decidedAt: null, decidedBy: null
      };
      database.prepare(`insert into approvals
        (id, run_id, kind, payload_hash, payload_json, status, expires_at, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?)`).run(approval.id, approval.runId, approval.kind, approval.payloadHash, approval.payloadJson, approval.status, approval.expiresAt, approval.createdAt);
      return { ...approval, payloadSummary: redact(payload) };
    },

    decideApproval(id, { decision, actorId = 'user', actorType = 'user', reason } = {}) {
      const row = getRow(id);
      ensureNotExpired(row, now());
      if (!['approved', 'rejected'].includes(decision)) throw domainError('invalid_approval_decision', 'Decisão de aprovação inválida.');
      if (actorType !== 'user') throw domainError('approval_decision_forbidden', 'A decisão de aprovação exige uma pessoa usuária.');
      const transition = canTransitionApproval(row.status, decision);
      if (!transition.allowed) throw domainError(transition.reason, 'A aprovação já possui uma decisão terminal.');
      const decidedAt = now().toISOString();
      const decisionAudit = createDecisionAudit({ actorId, actorType, reason, decision, decidedAt });
      database.prepare('update approvals set status = ?, decided_by = ?, decided_at = ? where id = ?').run(decision, JSON.stringify(decisionAudit), decidedAt, id);
      return toApproval({ ...row, status: decision, decided_by: JSON.stringify(decisionAudit), decided_at: decidedAt });
    },

    assertApproved(id, payload) {
      const row = getRow(id);
      ensureNotExpired(row, now());
      if (row.status !== 'approved') throw domainError('approval_required', 'A aprovação ainda não foi concedida.');
      if (row.payload_hash !== hashPayload(payload)) throw domainError('approval_payload_changed', 'O conteúdo mudou depois da aprovação.');
      return toApproval(row);
    },

    preview(id, payload) {
      const row = getRow(id);
      const actualHash = hashPayload(payload);
      const valid = row.payload_hash === actualHash;
      return { valid, expectedHash: row.payload_hash, actualHash, diff: valid ? [] : [{ field: 'payload', expected: row.payload_hash, actual: actualHash }] };
    },

    listApprovals() {
      return database.prepare('select * from approvals order by created_at desc').all().map(toApproval);
    },

    close() {
      database.close();
    }
  };

  function getRow(id) {
    const row = database.prepare('select * from approvals where id = ?').get(id);
    if (!row) throw domainError('approval_not_found', 'Aprovação não encontrada.');
    return row;
  }
}

function ensureNotExpired(row, currentTime) {
  if (Date.parse(row.expires_at) <= currentTime.getTime()) throw domainError('approval_expired', 'A aprovação expirou.');
}

function hashPayload(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function toApproval(row) {
  let payloadSummary = {};
  try { payloadSummary = redact(JSON.parse(row.payload_json ?? '{}')); } catch { payloadSummary = {}; }
  const decisionAudit = readDecisionAudit(row.decided_by);
  return {
    id: row.id, runId: row.run_id, kind: row.kind, payloadHash: row.payload_hash,
    status: row.status, decidedBy: decisionAudit.actorId, decisionActorType: decisionAudit.actorType, decisionReason: decisionAudit.reason, expiresAt: row.expires_at,
    createdAt: row.created_at, decidedAt: row.decided_at, payloadSummary
  };
}

function createDecisionAudit({ actorId, actorType, reason, decision, decidedAt }) {
  return {
    actorId: String(actorId || 'user'),
    actorType,
    reason: String(reason || `user_${decision}`),
    decidedAt
  };
}

function readDecisionAudit(value) {
  try {
    const audit = JSON.parse(value);
    if (audit && typeof audit === 'object' && audit.actorId) return audit;
  } catch {
    // Registros anteriores guardam apenas o identificador do ator.
  }
  return { actorId: value ?? null, actorType: null, reason: null };
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/(password|token|cookie|secret|mfa|authorization|credential)/i.test(key)).map(([key, entry]) => [key, redact(entry)]));
}

function domainError(code, message) {
  return createDomainError(code, message);
}
