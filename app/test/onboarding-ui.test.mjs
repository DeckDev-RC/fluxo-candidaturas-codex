import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('dashboard contains a complete local onboarding form', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const id of ['onboarding-section', 'onboarding-form', 'onboarding-name', 'onboarding-email', 'onboarding-target-roles', 'onboarding-campaign']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /action="\/api\/v1\/onboarding"/);
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /submissionApproval\.status/);
  for (const id of ['resume-tools', 'resume-job-description', 'resume-source-path', 'metrics-detail', 'pending-list', 'assessment-list', 'run-stream-id', 'run-events', 'queue-search', 'queue-add', 'follow-up-form', 'legacy-import-form', 'assessment-prep-form', 'assessment-result-form', 'assessment-timer', 'assessment-pause', 'application-tools', 'onboarding-period-start', 'onboarding-exclusions']) assert.match(html, new RegExp(`id=["']${id}["']`));
});
