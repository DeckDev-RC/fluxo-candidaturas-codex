import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('Autopilot UI exposes active memory, results, exception inbox and resumable actions', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  for (const id of ['autopilot-memory', 'autopilot-results', 'autopilot-exceptions', 'autopilot-pause', 'autopilot-resume-run', 'autopilot-change-goal', 'autopilot-evidence']) assert.match(html, new RegExp(`id=["']${id}["']`));
  for (const endpoint of ['/api/v1/memory', '/api/v1/exceptions', '/api/v1/runs/', '/api/v1/followup/check']) assert.match(app, new RegExp(endpoint.replaceAll('/', '\\/')));
  assert.match(app, /renderAutopilotMemory/);
  assert.match(app, /renderAutopilotResults/);
});
