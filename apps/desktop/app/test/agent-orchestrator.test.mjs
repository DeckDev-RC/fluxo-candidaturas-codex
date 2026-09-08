import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_CONTRACTS, chooseAgentTool } from '../src/agent-contracts.mjs';
import { createRunService } from '../src/run-service.mjs';
import { createAutopilotOrchestrator } from '../src/orchestrator-service.mjs';

test('agent contracts cover the five specialists and choose a local tool without exposing credentials', () => {
  assert.deepEqual(Object.keys(AGENT_CONTRACTS), ['intake', 'discovery', 'fit', 'application', 'followup']);
  assert.equal(AGENT_CONTRACTS.discovery.input.criteria, true);
  assert.equal(chooseAgentTool('discovery', { playwright: true }), 'playwright');
  assert.equal(chooseAgentTool('intake', { file: true, api: true }), 'file');
  assert.equal(chooseAgentTool('followup', { appServer: true, cloud: true }), 'app-server');
});

test('run service persists plan, current task, observation, tool, result and subtasks for resumable work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-run-metadata-'));
  const service = createRunService({ dbPath: join(root, 'harness.sqlite') });
  try {
    const run = service.startRun({ kind: 'autopilot', goal: 'Encontrar backend', mode: 'fixture' });
    service.setPlan(run.id, [{ id: 'discovery', status: 'running' }]);
    service.recordTask(run.id, { task: 'discovery', observation: 'Página observada', tool: 'playwright', result: { count: 2 } });
    service.addSubtask(run.id, { id: 'sub-1', parentTask: 'discovery', status: 'pending' });
    const saved = service.getRun(run.id);
    assert.equal(saved.goal, 'Encontrar backend');
    assert.equal(saved.mode, 'fixture');
    assert.equal(saved.currentTask, 'discovery');
    assert.equal(saved.tool, 'playwright');
    assert.deepEqual(saved.result, { count: 2 });
    assert.equal(service.listSubtasks(run.id)[0].id, 'sub-1');
  } finally { service.close(); }
});

test('fixture orchestrator executes specialists, persists progress and finishes only after confirmed result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-orchestrator-'));
  const runService = createRunService({ dbPath: join(root, 'harness.sqlite') });
  const calls = [];
  const orchestrator = createAutopilotOrchestrator({
    runService,
    agents: Object.fromEntries(['intake', 'discovery', 'fit', 'application', 'followup'].map((name) => [name, { async run(context) { calls.push(name); return { status: 'succeeded', observation: `${name} observado`, tool: 'fixture', result: { name }, confirmed: true }; } }]))
  });

  try {
    const started = await orchestrator.start({ objective: 'Encontrar backend', mode: 'fixture' });
    assert.equal(started.status, 'running');
    const finished = await started.completion;
    assert.equal(finished.status, 'succeeded');
    assert.deepEqual(calls, ['intake', 'discovery', 'fit', 'application', 'followup']);
    assert.equal(runService.getRun(started.run.id).status, 'succeeded');
    assert.equal(runService.listEvents(started.run.id).some((event) => event.type === 'autopilot.task.completed'), true);
  } finally { runService.close(); }
});
