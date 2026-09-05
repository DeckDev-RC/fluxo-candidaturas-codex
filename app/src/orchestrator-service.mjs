import { AGENT_CONTRACTS } from './agent-contracts.mjs';

const PLAN = ['intake', 'discovery', 'fit', 'application', 'followup'];

export function createAutopilotOrchestrator({ runService, agents = {}, memoryService, auditService, maxRetries = 1 } = {}) {
  return {
    async start({ objective = '', mode = 'autonomous', runId = '', input = {} } = {}) {
      const run = runService.startRun({ kind: 'autopilot', goal: String(objective), mode });
      const plan = PLAN.map((id, index) => ({ id, label: id, status: index === 0 ? 'running' : 'pending' }));
      if (runService.setPlan) runService.setPlan(run.id, plan);
      runService.appendEvent({ runId: run.id, type: 'autopilot.plan.created', payload: { plan, contracts: AGENT_CONTRACTS } });
      if (memoryService?.recordExecution) await memoryService.recordExecution({ runId: run.id, objective, status: 'running', checkpoint: 'intake' });
      const completion = execute({ run, objective, mode, plan, parentRunId: runId, input });
      const response = { run, plan, status: 'running' };
      Object.defineProperty(response, 'completion', { value: completion, enumerable: false });
      return response;
    }
  };

  async function execute({ run, objective, mode, plan, parentRunId, input }) {
    const context = { runId: run.id, parentRunId, objective: String(objective), mode, plan, input: { ...input }, outputs: {} };
    try {
      for (let index = 0; index < PLAN.length; index += 1) {
        const agentName = PLAN[index];
        const agent = agents[agentName];
        if (!agent?.run) throw domainError('agent_contract_unavailable', `O agente ${agentName} não está disponível.`);
        if (runService.recordTask) runService.recordTask(run.id, { task: agentName, observation: 'Iniciando tarefa.', tool: 'local', result: null });
        runService.appendEvent({ runId: run.id, type: 'autopilot.task.started', payload: { task: agentName, index } });
        const result = await withRetry(agent, context, agentName, run.id);
        if (result?.confirmed !== true && agentName === 'application') throw domainError('unconfirmed_result', 'A candidatura não possui confirmação observada.');
        plan[index].status = 'succeeded'; if (plan[index + 1]) plan[index + 1].status = 'running';
        if (runService.setPlan) runService.setPlan(run.id, plan);
        context.outputs[agentName] = result?.result ?? result;
        if (runService.recordTask) runService.recordTask(run.id, { task: agentName, observation: result?.observation ?? 'Tarefa concluída.', tool: result?.tool ?? 'local', result: result?.result ?? result });
        if (auditService?.record) await auditService.record({ runId: run.id, task: agentName, tool: result?.tool ?? 'local', observation: result?.observation ?? {}, result: result?.result ?? result, confidence: result?.confidence ?? 'média', reason: result?.reason ?? 'Resultado do agente local.' });
        runService.appendEvent({ runId: run.id, type: 'autopilot.task.completed', payload: { task: agentName, result: safeResult(result) } });
        if (memoryService?.recordExecution) await memoryService.recordExecution({ runId: run.id, objective, status: 'running', checkpoint: PLAN[index + 1] ?? 'concluído' });
      }
      const finished = runService.finishRun ? runService.finishRun(run.id, 'succeeded', 'Jornada concluída com resultados confirmados.') : { ...run, status: 'succeeded' };
      runService.appendEvent({ runId: run.id, type: 'autopilot.completed', payload: { status: 'succeeded' } });
      return { run: finished, plan, status: 'succeeded', message: 'A jornada foi concluída com resultados confirmados.' };
    } catch (error) {
      const failedPlan = plan.find((step) => step.status === 'running'); if (failedPlan) failedPlan.status = 'needs_attention';
      if (runService.setPlan) runService.setPlan(run.id, plan);
      if (runService.pauseRun) { try { runService.pauseRun(run.id, error.message); } catch {} }
      runService.appendEvent({ runId: run.id, type: 'autopilot.exception', payload: { task: failedPlan?.id ?? '', message: error.message, retryable: false } });
      if (memoryService?.recordExecution) await memoryService.recordExecution({ runId: run.id, objective, status: 'needs_attention', checkpoint: failedPlan?.id ?? '' });
      return { run: runService.getRun?.(run.id) ?? { ...run, status: 'paused' }, plan, status: 'needs_attention', error: error.message };
    }
  }

  async function withRetry(agent, context, agentName, runId) {
    for (let attempt = 0; ; attempt += 1) {
      try { return await agent.run({ ...context, task: agentName }); }
      catch (error) { if (attempt >= maxRetries || error?.retryable !== true) throw error; runService.appendEvent({ runId, type: 'autopilot.retry', payload: { task: agentName, attempt: attempt + 1 } }); }
    }
  }
}

function safeResult(result) { if (!result || typeof result !== 'object') return result; return Object.fromEntries(Object.entries(result).filter(([key]) => !/(password|token|cookie|secret|credential)/i.test(key))); }
function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
