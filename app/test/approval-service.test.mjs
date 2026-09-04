import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovalService } from '../src/approval-service.mjs';

test('approval service creates and approves a hash-bound request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-approval-'));
  const service = createApprovalService({ dbPath: join(root, 'harness.sqlite') });

  try {
    const approval = service.requestApproval({ runId: 'run-1', kind: 'submission', payload: { company: 'Acme', role: 'Dev' } });
    const listed = service.listApprovals();
    const approved = service.decideApproval(approval.id, { decision: 'approved', actorId: 'candidate' });
    const verified = service.assertApproved(approval.id, { company: 'Acme', role: 'Dev' });

    assert.equal(approval.status, 'pending');
    assert.equal(listed[0].payloadSummary.company, 'Acme');
    assert.equal(approved.status, 'approved');
    assert.equal(verified.status, 'approved');
  } finally {
    service.close();
  }
});

test('approval service rejects changed payload and expired approval', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-approval-'));
  let current = new Date('2026-09-04T12:00:00Z');
  const service = createApprovalService({ dbPath: join(root, 'harness.sqlite'), now: () => current });

  try {
    const changed = service.requestApproval({ runId: 'run-1', kind: 'submission', payload: { role: 'Dev' } });
    service.decideApproval(changed.id, { decision: 'approved', actorId: 'candidate' });
    assert.throws(
      () => service.assertApproved(changed.id, { role: 'Senior Dev' }),
      (error) => error.code === 'approval_payload_changed'
    );

    const expired = service.requestApproval({ runId: 'run-1', kind: 'message', payload: { text: 'Olá' }, ttlMs: 1000 });
    current = new Date('2026-09-04T12:00:02Z');
    assert.throws(
      () => service.decideApproval(expired.id, { decision: 'approved', actorId: 'candidate' }),
      (error) => error.code === 'approval_expired'
    );
  } finally {
    service.close();
  }
});

test('approval service previews payload validity and exposes a diff', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-approval-preview-'));
  const service = createApprovalService({ dbPath: join(root, 'approval.sqlite') });
  try {
    const approval = service.requestApproval({ runId: 'run-1', kind: 'submission', payload: { role: 'Dev', resume: 'curriculo/a.txt' } });
    const preview = service.preview(approval.id, { role: 'Changed', resume: 'curriculo/a.txt' });
    assert.equal(preview.valid, false);
    assert.equal(preview.diff[0].field, 'payload');
    assert.equal(preview.expectedHash.length, 64);
  } finally { service.close(); }
});
