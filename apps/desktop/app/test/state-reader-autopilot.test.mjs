import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFluxoState } from '../src/state-reader.mjs';

test('state reader exposes safe Autopilot memory, discovery, follow-up and exception summaries after restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-state-autopilot-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  await writeFile(join(root, 'estado', 'preflight.json'), JSON.stringify({ ready: true }));
  await writeFile(join(root, 'estado', 'memoria.json'), JSON.stringify({ facts: { targetRoles: { value: 'Backend', source: 'onboarding' }, pcd: { value: 'Sim', sensitive: true }, workAuthorization: { value: 'Sim', sensitive: true }, apiToken: { value: 'secret' } }, resumes: [], executions: [] }));
  await writeFile(join(root, 'estado', 'discovery.json'), JSON.stringify({ opportunities: [{ id: 'job-1' }], failures: [] }));
  await writeFile(join(root, 'estado', 'followup.json'), JSON.stringify({ events: [{ id: 'event-1' }], known: {} }));
  await writeFile(join(root, 'estado', 'excecoes.json'), JSON.stringify([{ id: 'ex-1', status: 'open', message: 'atenção' }]));
  const state = await readFluxoState(root);
  assert.equal(state.memory.facts.targetRoles.value, 'Backend');
  assert.equal('apiToken' in state.memory.facts, false);
  assert.equal('workAuthorization' in state.memory.facts, false);
  assert.equal('pcd' in state.memory.facts, false);
  assert.equal(state.discovery.opportunities.length, 1);
  assert.equal(state.followup.events.length, 1);
  assert.equal(state.exceptions.length, 1);
});
