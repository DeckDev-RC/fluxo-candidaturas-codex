import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('onboarding success handler has no approval-only variables', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const onboarding = app.slice(app.indexOf('async function saveOnboarding'), app.indexOf('function splitValues'));
  assert.doesNotMatch(onboarding, /submissionApproval|\bid\b|\bdecision\b/);
});

test('approval decision updates the active submission state before refreshing', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const approval = app.slice(app.indexOf('async function decideApproval'), app.indexOf('async function runPreflight'));
  assert.match(approval, /submissionApproval\?\.id === id/);
  assert.match(approval, /submissionApproval\.status = decision/);
});

test('approval request keeps final submission locked until explicit approval', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const request = app.slice(app.indexOf('async function requestApplicationApproval'), app.indexOf('async function submitApplication'));
  assert.match(request, /querySelector\('\[data-application-action="submit"\]'\)\.disabled = true/);
});

test('application actions expose a clear busy state while the local flow is running', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /Preparando…/);
  assert.match(app, /Solicitando aprovação…/);
  assert.match(app, /Confirmando envio…/);
});
