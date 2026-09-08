import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from '../diagnostics.mjs';

test('missing automation dependencies leave offline read available and provide actionable diagnostics', async () => {
  const report = await diagnose({ probe: async () => ({ ok: false }), browserAvailable: async () => false });
  assert.equal(report.capabilities.offline, true);
  assert.equal(report.capabilities.automation, false);
  assert.ok(report.checks.filter(x => !x.ok).every(x => x.action));
});

test('dependency stdout is not exposed by diagnostics', async () => {
  const report = await diagnose({ probe: async () => ({ ok: true, stdout: 'password=secret-example' }), browserAvailable: async () => true });
  assert.equal(report.capabilities.automation, true);
  assert.doesNotMatch(JSON.stringify(report), /secret-example/);
});
