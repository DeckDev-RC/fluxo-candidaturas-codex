import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePreflight } from '../public/preflight-summary.js';

test('summarizePreflight counts only pending critical checks', () => {
  const summary = summarizePreflight({
    checks: [
      { level: 'warning', status: 'pending' },
      { level: 'critical', status: 'ok' },
      { level: 'critical', status: 'pending' },
      { level: 'info', status: 'pending' }
    ]
  });

  assert.equal(summary, '1 pendência(s) crítica(s) no preflight');
});

test('summarizePreflight reports no critical pending checks when only warnings remain', () => {
  const summary = summarizePreflight({
    checks: [{ level: 'warning', status: 'pending' }]
  });

  assert.equal(summary, 'Sem pendências críticas registradas');
});
