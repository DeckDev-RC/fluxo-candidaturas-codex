import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('each product area has a focused screen contract and fixture data', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const server = await readFile(new URL('../src/http-server.mjs', import.meta.url), 'utf8');
  const fixture = JSON.parse(await readFile(new URL('../public/fixtures/ui-state.json', import.meta.url), 'utf8'));
  for (const route of ['home', 'setup', 'queue', 'applications', 'operations', 'followup']) {
    assert.match(html, new RegExp(`href=["']#${route}["']`));
    assert.ok(fixture.screens.includes(route), `fixture must cover ${route}`);
  }
  for (const id of ['screen-context', 'screen-title', 'screen-description', 'screen-back', 'screen-state', 'fixture-banner', 'autopilot-panel', 'autopilot-start', 'autopilot-intent', 'autopilot-resume', 'autopilot-plan', 'autopilot-timeline', 'autopilot-exception', 'autopilot-decisions', 'autopilot-answers-form', 'autopilot-answers-submit']) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(server, /\/fixtures\/ui-state\.json/);
  // Todo módulo importado pela UI precisa estar na lista de arquivos servidos.
  for (const [, module] of (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')).matchAll(/from '\.\/([\w-]+\.js)'/g)) {
    assert.match(server, new RegExp(`'/${module}'`), `${module} precisa ser servido pelo http-server`);
  }
});

test('screen architecture defines route-specific layouts and browser fixture mode', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(app, /get\('fixture'\)/);
  assert.match(app, /previousRoute/);
  assert.match(app, /pendingQueueItemId/);
  assert.match(app, /itemId: pendingQueueItemId/);
  assert.match(app, /autopilot-start/);
  assert.match(app, /autopilot\/start/);
  assert.match(app, /Autopilot do Fluxo/);
  const start = app.slice(app.indexOf('async function startAutopilot'), app.indexOf('function renderAutopilot'));
  assert.match(start, /fixture/);
  assert.match(app, /autopilot\.plan\.created/);
  assert.match(start, /connectRunStream\(\)/);
  assert.match(start, /autopilot-intent/);
  assert.match(start, /autopilot-resume/);
  assert.match(app, /importResumeFile/);
  assert.match(app, /\/api\/v1\/resumes\/import/);
  assert.match(app, /lifecycle-banner/);
  // A pausa do Autopilot precisa virar uma decisão respondível na própria tela.
  assert.match(app, /autopilot\.waiting_user/);
  assert.match(app, /mountAutopilotDecisions/);
  assert.match(app, /refreshRuntimePanels/);
  assert.match(app, /getItem\('fluxo-autopilot-intent'\)/);
  assert.match(app, /renderAutopilotTimeline/);
  assert.match(app, /screen-title/);
  assert.match(app, /dataset\.screenState/);
  assert.match(css, /data-route="setup"/);
  assert.match(css, /data-route="operations"/);
});
