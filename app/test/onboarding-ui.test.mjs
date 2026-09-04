import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('dashboard contains a complete local onboarding form', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const id of ['onboarding-section', 'onboarding-form', 'onboarding-name', 'onboarding-email', 'onboarding-target-roles', 'onboarding-campaign']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /action="\/api\/v1\/onboarding"/);
  for (const id of ['resume-tools', 'resume-job-description', 'resume-source-path', 'metrics-detail', 'pending-list', 'assessment-list']) assert.match(html, new RegExp(`id=["']${id}["']`));
});
