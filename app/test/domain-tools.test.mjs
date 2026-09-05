import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomainTools } from '../src/domain-tools.mjs';

test('domain registry denies arbitrary commands and approval decisions', async () => {
  const tools = createDomainTools({ readState: async () => ({ queue: { items: [] } }) });
  assert.equal(tools.definitions.some(tool => /shell|exec|approve|decision/.test(tool.name)), false);
  await assert.rejects(tools.call('shell', { command: 'echo nope' }, 'run1'), { code: 'tool_not_allowed' });
  await assert.rejects(tools.call('approval_decide', {}, 'run1'), { code: 'tool_not_allowed' });
  assert.deepEqual(await tools.call('fluxo_state', {}, 'run1'), { queue: { items: [] } });
});

test('agent cannot submit or fill another run context', async () => {
  const tools = createDomainTools({ applicationFlow: { getWorkflow() { return { parentRunId: 'other' }; } } });
  await assert.rejects(tools.call('fluxo_submit', { runId: 'foreign', approvalId: 'a' }, 'mine'), { code: 'tool_run_mismatch' });
});
