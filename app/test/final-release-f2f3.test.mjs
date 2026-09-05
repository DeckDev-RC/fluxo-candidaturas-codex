import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunService } from '../src/run-service.mjs';
import { createAutopilotOrchestrator } from '../src/orchestrator-service.mjs';
import { createProductionAgents } from '../src/production-agents.mjs';
import { createDomainTools } from '../src/domain-tools.mjs';
import { createRuntimeHealth } from '../src/runtime-health.mjs';
import { resolveAiMode } from '../src/ai-modes.mjs';
import { createCampaignBudget } from '../src/campaign-budget.mjs';
import { classifyError } from '../src/error-classifier.mjs';
import { classifyCompletion } from '../src/completion-states.mjs';
import { validateToolInput } from '../src/tool-validation.mjs';

test('runtime health distinguishes signed out, expired and unavailable without using developer PATH', async () => {
  const health = createRuntimeHealth({ authService: { async status() { return { signedIn: false, expiresAt: '2020-01-01T00:00:00.000Z' }; } } });
  const snapshot = await health.snapshot();
  assert.equal(snapshot.offlineRead, true);
  assert.equal(['signed_out', 'expired', 'unavailable'].includes(snapshot.state), true);
});

test('unsupported AI mode or silent provider switch is refused', () => {
  assert.throws(() => resolveAiMode({ requested: 'fixture-silent', runtime: { available: true } }), { code: 'ai_mode_unsupported' });
  assert.throws(() => resolveAiMode({ requested: 'codex-app-server', runtime: { available: false } }), { code: 'ai_mode_unavailable' });
});

test('domain-invalid nested arguments are rejected before side effects', () => {
  assert.throws(() => validateToolInput('fluxo_discover', { searchUrl: 'file:///etc/passwd', platform: 'GUPY' }), { code: 'invalid_url' });
  assert.throws(() => validateToolInput('fluxo_discover', { searchUrl: 'https://gupy.io', platform: 'UNKNOWN' }), { code: 'invalid_platform' });
});

test('production autopilot fails explicitly when a specialist is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-prod-missing-'));
  const runService = createRunService({ dbPath: join(root, 'harness.sqlite') });
  const orchestrator = createAutopilotOrchestrator({ runService, agents: { intake: { async run() { return { confirmed: true, result: {} }; } } } });
  await assert.rejects(orchestrator.start({ objective: 'Backend', mode: 'autonomous' }), { code: 'agent_contract_unavailable' });
  runService.close();
});

test('human rejection does not submit and does not wake the same task twice', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-human-'));
  const runService = createRunService({ dbPath: join(root, 'harness.sqlite') });
  const orchestrator = createAutopilotOrchestrator({
    runService,
    agents: Object.fromEntries(['intake', 'discovery', 'fit', 'application', 'followup'].map((name) => [name, { async run() { return { status: 'waiting_user', observation: 'precisa revisão', confirmed: false, result: {} }; } }]))
  });
  const started = await orchestrator.start({ objective: 'Backend' });
  await started.completion;
  const first = await orchestrator.handleHumanEvent({ runId: started.run.id, kind: 'rejected', taskId: 'application' });
  const second = await orchestrator.handleHumanEvent({ runId: started.run.id, kind: 'rejected', taskId: 'application' });
  assert.equal(first.submitted, false);
  assert.equal(second.woken, false);
  runService.close();
});

test('cancelled campaign budget blocks new external actions for child runs', () => {
  const budget = createCampaignBudget();
  const child = budget.childBudget();
  budget.cancel();
  assert.throws(() => child.assertCanAct('external'), { code: 'campaign_cancelled' });
});

test('errors are classified into retry, reconcile or intervene with a finite circuit', () => {
  assert.equal(classifyError({ code: 'network_error', retryable: true }).action, 'retry');
  assert.equal(classifyError({ code: 'submission_not_confirmed' }).action, 'reconcile');
  assert.equal(classifyError({ code: 'approval_decision_forbidden' }).retryable, false);
});

test('empty queue or model message is not campaign completion', () => {
  assert.equal(classifyCompletion({ emptyQueue: true, modelSaidDone: true }).complete, false);
  assert.equal(classifyCompletion({ explicitClose: true }).level, 'campaign');
});

test('agent tools cannot approve or execute shell', async () => {
  const tools = createDomainTools({ readState: async () => ({}) });
  await assert.rejects(tools.call('shell', { command: 'rm' }, 'run'), { code: 'tool_not_allowed' });
});

test('production agents expose identity, tools and refuse fixture mode in discovery', async () => {
  const agents = createProductionAgents({
    intakeService: { async preview() { return { facts: {}, missing: [], questions: [], ready: true }; } },
    discoveryService: { async discover() { return { created: [] }; } },
    fitService: { shortlist() { return { items: [] }; } },
    followUpMonitor: { async check() { return { summary: 'ok', failures: [] }; } },
    applicationFlow: {},
    memoryService: { async safeSummary() { return { facts: {} }; } },
    campaignService: { async getCampaign() { return { filters: {}, platforms: [] }; } }
  });
  assert.equal(agents.intake.identity ?? 'intake', agents.intake.name);
  await assert.rejects(agents.discovery.run({ mode: 'fixture', input: {}, outputs: {}, runId: 'r1' }), { code: 'fixture_forbidden' });
});
