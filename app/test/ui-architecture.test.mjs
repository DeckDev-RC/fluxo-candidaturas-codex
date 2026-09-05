import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('app shell exposes focused UX views instead of one long workspace', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const view of ['home', 'setup', 'queue', 'applications', 'operations', 'followup']) assert.match(html, new RegExp(`data-view=["']${view}["']`));
  for (const route of ['home', 'setup', 'queue', 'applications', 'operations', 'followup']) assert.match(html, new RegExp(`href=["']#${route}["']`));
  assert.match(html, /nav-label/);
  assert.match(html, /breadcrumbs[^>]*>[\s\S]*href=["']#home["']/);
});

test('router keeps the current view and navigation state synchronized', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(app, /function renderRoute/);
  assert.match(app, /location\.hash/);
  assert.match(app, /dataset\.route/);
  assert.match(app, /aria-current/);
  assert.match(app, /activeRoute !== 'setup'/);
  assert.ok(app.indexOf('const routeLabels') < app.indexOf('setupRouter();'), 'route table must exist before router boot');
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(css, /data-route="queue"/);
  assert.match(app, /let previousRoute/);
  assert.match(app, /goTo\(previousRoute \|\| 'home'\)/);
});
