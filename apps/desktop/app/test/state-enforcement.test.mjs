import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeNewFluxoPersistence } from '../src/persistence-authority.mjs';
import { createFollowUpService } from '../src/follow-up-service.mjs';

test('generic follow-up cannot fabricate submission or reactivate a terminal application', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'fluxo-state-enforcement-'));
  const p = await initializeNewFluxoPersistence({ rootDir });
  const service = createFollowUpService({ rootDir, persistence: p });
  try {
    await p.replaceApplications([{ id: 'draft', status: 'rascunho' }, { id: 'closed', status: 'rejeitada' }]);
    await assert.rejects(service.recordEvent({ reference: 'draft', type: 'status', status: 'enviada' }), { code: 'submission_not_confirmed' });
    await assert.rejects(service.recordEvent({ reference: 'closed', type: 'status', status: 'triagem' }), { code: 'application_terminal' });
  } finally { service.close(); p.close(); }
});
