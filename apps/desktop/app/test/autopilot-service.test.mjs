import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutopilotService } from '../src/autopilot-service.mjs';

test('autopilot creates an observable end-to-end plan and starts the local AI turn', async () => {
  const events = [];
  let threadInput;
  let turnInput;
  const service = createAutopilotService({
    runService: {
      startRun(input) { return { id: 'run-auto-1', ...input }; },
      appendEvent(input) { events.push(input); return { id: `event-${events.length}`, ...input }; },
      setAgentThread(runId, threadId) { events.push({ type: 'thread.persisted', runId, threadId }); },
      setCurrentTurn(runId, turnId) { events.push({ type: 'turn.persisted', runId, turnId }); }
    },
    agentAdapter: {
      async startThread(input) { threadInput = input; return { thread: { id: 'thread-auto-1' } }; },
      async runTurnForRun(runId, threadId, text) { turnInput = { runId, threadId, text }; return { turn: { id: 'turn-auto-1' }, status: 'running' }; }
    }
  });

  const result = await service.start({ targetRoles: 'Desenvolvedor backend', platforms: ['GUPY'] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.run.id, 'run-auto-1');
  assert.deepEqual(result.plan.map((step) => step.id), ['profile', 'discovery', 'fit', 'applications', 'followup']);
  assert.equal(result.timeline.length, 3);
  assert.match(result.timeline[0].message, /plano/i);
  assert.equal(threadInput.metadata.mode, 'fluxo-autopilot');
  assert.equal(turnInput.runId, 'run-auto-1');
  assert.match(turnInput.text, /Desenvolvedor backend/);
  assert.equal(events.some((event) => event.type === 'autopilot.plan.created'), true);
});

test('autopilot carries the user intent and selected local resume into the agent brief', async () => {
  let prompt = '';
  const service = createAutopilotService({
    runService: { startRun() { return { id: 'run-brief-1' }; }, appendEvent() {}, setAgentThread() {}, setCurrentTurn() {} },
    agentAdapter: {
      async startThread() { return { thread: { id: 'thread-brief-1' } }; },
      async runTurnForRun(_runId, _threadId, text) { prompt = text; return { turn: { id: 'turn-brief-1' } }; }
    }
  });

  await service.start({ intent: 'Quero vagas remotas de dados', resumePath: 'curriculo/cv.pdf' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(prompt, /Quero vagas remotas de dados/);
  assert.match(prompt, /curriculo\/cv\.pdf/);
});

test('autopilot returns control while the AI continues the run asynchronously', async () => {
  let releaseTurn;
  const service = createAutopilotService({
    runService: { startRun() { return { id: 'run-async-1' }; }, appendEvent() {}, setAgentThread() {}, setCurrentTurn() {} },
    agentAdapter: {
      async startThread() { return { thread: { id: 'thread-async-1' } }; },
      runTurnForRun() { return new Promise((resolve) => { releaseTurn = () => resolve({ turn: { id: 'turn-async-1' } }); }); }
    }
  });

  const result = await Promise.race([service.start({}), new Promise((resolve) => setTimeout(() => resolve('timeout'), 50))]);
  assert.notEqual(result, 'timeout');
  assert.equal(result.status, 'running');
  releaseTurn();
});
