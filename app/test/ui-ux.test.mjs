import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('UI exposes a guided command center and progressive onboarding', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const id of ['primary-nav', 'next-action', 'onboarding-progress', 'onboarding-error-summary', 'toast-region', 'application-stepper']) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /aria-label="Você está em"/);
  assert.match(html, /Run atual/);
  for (const id of ['identity', 'objective', 'preferences', 'campaign', 'review']) assert.match(html, new RegExp(`aria-controls=["']wizard-step-${id}["']`));
  assert.doesNotMatch(html, /name="questionsJson"/);
  assert.match(html, /aria-current/);
  assert.match(html, /<select name="platform"/);
  assert.match(html, /type="checkbox" name="platforms"/);
  assert.match(html, /<select name="seniority"/);
  assert.match(html, /<select name="workModes"/);
  for (const id of ['queue-status-filter', 'queue-fit-filter', 'onboarding-review', 'resume-file', 'application-review', 'application-status', 'onboarding-clear-draft']) assert.match(html, new RegExp(`id=["']${id}["']`));
});

test('UI script persists onboarding draft and uses accessible focus feedback', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(app, /input.*searchQueue/);
  assert.match(app, /localStorage/);
  assert.match(app, /removeItem\('fluxo-onboarding-draft'\)/);
  assert.match(app, /fluxo-onboarding-step/);
  assert.match(app, /onboarding-progress/);
  assert.match(app, /focus\(\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /input, textarea, select\s*\{/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(app, /renderApprovalDetails/);
  assert.match(app, /classifyFit/);
  assert.match(app, /inferPlatformFromUrl/);
  assert.match(app, /is-loading/);
});
