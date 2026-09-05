import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentEventHandler } from '../src/agent-events.mjs';
import { createCampaignBudget } from '../src/campaign-budget.mjs';

// F8-06: o teto de tokens só protege se alguém medir. O consumo informado pelo
// App Server passa a alimentar o orçamento da campanha.

function runServiceFalso(status = 'running') {
  const eventos = [];
  return {
    eventos,
    appendEvent(evento) { eventos.push(evento); return evento; },
    getRun() { return { status }; },
    recordTask() {},
    pauseRun() {}
  };
}

test('consumo informado no turno entra no orçamento da campanha', () => {
  const runService = runServiceFalso();
  const budget = createCampaignBudget({ config: { maxRunTokens: 1000 } });
  const handler = createAgentEventHandler(runService, { budget });

  handler({ method: 'turn/completed', params: { turn: { status: 'completed', usage: { inputTokens: 300, outputTokens: 200 } } } }, 'run-1');
  assert.equal(budget.snapshot().tokens, 500);
  const registro = runService.eventos.find((evento) => evento.type === 'agent.usage.recorded');
  assert.equal(registro.payload.tokens, 500);

  handler({ method: 'turn/completed', params: { turn: { status: 'completed', usage: { totalTokens: 600 } } } }, 'run-1');
  assert.equal(budget.snapshot().tokens, 1100);
  assert.throws(() => budget.assertCanAct('external'), { code: 'run_token_limit' }, 'passar do teto medido interrompe a ação externa');
});

test('turno sem consumo informado não inventa estimativa', () => {
  const runService = runServiceFalso();
  const budget = createCampaignBudget({ config: { maxRunTokens: 1000 } });
  const handler = createAgentEventHandler(runService, { budget });

  handler({ method: 'turn/completed', params: { turn: { status: 'completed' } } }, 'run-1');
  assert.equal(budget.snapshot().tokens, 0);
  assert.equal(runService.eventos.some((evento) => evento.type === 'agent.usage.recorded'), false);
});

test('nomes alternativos de consumo do App Server são reconhecidos', () => {
  const budget = createCampaignBudget({ config: { maxRunTokens: 10_000 } });
  const handler = createAgentEventHandler(runServiceFalso(), { budget });
  handler({ method: 'turn/completed', params: { turn: { status: 'completed', usage: { input_tokens: 10, output_tokens: 5 } } } }, 'run-1');
  handler({ method: 'turn/completed', params: { turn: { status: 'completed' }, usage: { promptTokens: 7, completionTokens: 3 } } }, 'run-1');
  assert.equal(budget.snapshot().tokens, 25);
});

test('sem orçamento injetado o handler continua registrando o turno', () => {
  const runService = runServiceFalso();
  const handler = createAgentEventHandler(runService);
  handler({ method: 'turn/completed', params: { turn: { status: 'completed', usage: { totalTokens: 42 } } } }, 'run-1');
  assert.equal(runService.eventos.some((evento) => evento.type === 'turn/completed'), true);
});
