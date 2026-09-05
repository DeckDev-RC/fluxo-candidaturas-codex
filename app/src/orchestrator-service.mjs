import { AGENT_CONTRACTS } from './agent-contracts.mjs';
import { classifyError } from './error-classifier.mjs';
import { classifyCompletion } from './completion-states.mjs';
import { createCampaignBudget } from './campaign-budget.mjs';
import { createBrowserLease } from './browser-lease.mjs';

const PLAN = ['intake', 'discovery', 'fit', 'application', 'followup'];

const PLAN_LABELS = {
  intake: 'Entender seu perfil e completar o que faltar',
  discovery: 'Pesquisar oportunidades compatíveis',
  fit: 'Comparar aderência, prioridade e duplicidade',
  application: 'Preparar e conduzir candidaturas elegíveis',
  followup: 'Acompanhar respostas, testes, entrevistas e prazos'
};

export function createAutopilotOrchestrator({ runService, agents = {}, memoryService, auditService, maxRetries = 1, budget } = {}) {
  const campaignBudget = budget ?? createCampaignBudget();
  const lease = createBrowserLease();
  const contexts = new Map();
  const woken = new Set();

  return {
    async start({ objective = '', mode = 'autonomous', runId = '', input = {} } = {}) {
      if (mode !== 'fixture') {
        for (const name of PLAN) {
          if (!agents[name]?.run) throw domainError('agent_contract_unavailable', `O especialista ${name} está indisponível.`);
        }
      }
      const run = runService.startRun({ kind: 'autopilot', goal: String(objective), mode });
      const plan = PLAN.map((id, index) => ({ id, label: PLAN_LABELS[id], status: index === 0 ? 'running' : 'pending' }));
      if (runService.setPlan) runService.setPlan(run.id, plan);
      persistTasks(run.id, plan);
      runService.appendEvent({ runId: run.id, type: 'autopilot.plan.created', payload: { plan, contracts: AGENT_CONTRACTS } });
      if (memoryService?.recordExecution) await memoryService.recordExecution({ runId: run.id, objective, status: 'running', checkpoint: 'intake' });
      const completion = execute({ run, objective, mode, plan, parentRunId: runId, input });
      const response = { run, plan, status: 'running' };
      Object.defineProperty(response, 'completion', { value: completion, enumerable: false });
      return response;
    },

    async continue(runId, extraInput = {}) {
      const saved = loadContext(runId);
      if (!saved) throw domainError('run_not_found', 'Não há jornada persistida para retomar.');
      saved.input = { ...saved.input, ...extraInput };
      campaignBudget.resumeFromUser();
      if (runService.resumeRun) {
        try { runService.resumeRun(runId, { reconciled: true, checkpointMatches: true }); } catch {}
      }
      return execute(saved);
    },

    async handleHumanEvent({ runId, kind, taskId = '', payload = {} } = {}) {
      const key = `${runId}:${taskId || kind}`;
      if (woken.has(key)) return { woken: false, reason: 'already_woken' };
      woken.add(key);
      const saved = loadContext(runId) ?? { run: runService.getRun(runId), objective: '', mode: 'autonomous', plan: runService.getRun(runId)?.plan ?? [], input: {}, outputs: {} };
      if (kind === 'rejected') {
        runService.appendEvent({ runId, type: 'autopilot.human.rejected', payload: { taskId } });
        return { woken: true, submitted: false, continueIndependent: true };
      }
      saved.input = { ...saved.input, ...payload, humanEvent: kind };
      campaignBudget.resumeFromUser();
      return { woken: true, completion: execute(saved) };
    },

    cancel(runId) {
      campaignBudget.cancel();
      const children = runService.listRuns?.().filter((run) => run.id === runId || contexts.get(run.id)?.parentRunId === runId) ?? [];
      for (const child of children) {
        try { runService.finishRun?.(child.id, 'cancelled', 'Cancelamento da campanha.'); } catch {}
      }
      lease.release(lease.owner());
      return { cancelled: true, children: children.length };
    },

    budget: campaignBudget,
    browserLease: lease
  };

  function persistTasks(runId, plan) {
    if (!runService.addSubtask) return;
    for (const step of plan) runService.addSubtask(runId, { id: `${runId}:${step.id}`, parentTask: step.id, status: step.status });
  }

  function saveContext(context) {
    contexts.set(context.run.id, context);
    runService.saveWorkflow?.(context.run.id, { kind: 'orchestrator', objective: context.objective, mode: context.mode, plan: context.plan, input: context.input, outputs: context.outputs, parentRunId: context.parentRunId });
  }

  function loadContext(runId) {
    if (contexts.has(runId)) return contexts.get(runId);
    const workflow = runService.getWorkflow?.(runId);
    const run = runService.getRun?.(runId);
    if (!workflow || !run) return null;
    const context = { run, ...workflow };
    contexts.set(runId, context);
    return context;
  }

  async function execute({ run, objective, mode, plan, parentRunId, input, outputs = {} }) {
    const context = { run, runId: run.id, parentRunId, objective: String(objective), mode, plan, input: { ...input }, outputs: { ...outputs } };
    saveContext(context);
    try {
      for (let index = 0; index < PLAN.length; index += 1) {
        if (plan[index].status === 'succeeded') continue;
        campaignBudget.assertCanAct(PLAN[index] === 'followup' ? 'read' : 'external');
        const agentName = PLAN[index];
        const agent = agents[agentName];
        if (!agent?.run) throw domainError('agent_contract_unavailable', `O agente ${agentName} não está disponível.`);
        if (runService.recordTask) runService.recordTask(run.id, { task: agentName, observation: 'Iniciando tarefa.', tool: 'local', result: null });
        runService.appendEvent({ runId: run.id, type: 'autopilot.task.started', payload: { task: agentName, index } });
        if (['application', 'discovery', 'followup'].includes(agentName)) lease.acquire(`${run.id}:${agentName}`);
        const result = await withRetry(agent, context, agentName, run.id);
        if (['application', 'discovery', 'followup'].includes(agentName)) lease.release(`${run.id}:${agentName}`);
        if (result?.status === 'waiting_user') {
          plan[index].status = 'waiting_user';
          if (runService.setPlan) runService.setPlan(run.id, plan);
          campaignBudget.waitForUser();
          if (runService.pauseRun) try { runService.pauseRun(run.id, result.observation); } catch {}
          saveContext(context);
          const pause = { run: runService.getRun?.(run.id) ?? run, plan, status: 'waiting_user', message: result.observation, result: result.result };
          // A pausa precisa chegar à interface: o início da jornada responde antes desta etapa.
          runService.appendEvent({ runId: run.id, type: 'autopilot.waiting_user', payload: { task: agentName, runId: run.id, message: result.observation, plan, questions: result.result?.questions ?? [], missing: result.result?.missing ?? [] } });
          return pause;
        }
        if (result?.confirmed !== true && agentName === 'application') throw domainError('unconfirmed_result', 'A candidatura não possui confirmação observada.');
        plan[index].status = 'succeeded'; if (plan[index + 1]) plan[index + 1].status = 'running';
        if (runService.setPlan) runService.setPlan(run.id, plan);
        context.outputs[agentName] = result?.result ?? result;
        if (runService.recordTask) runService.recordTask(run.id, { task: agentName, observation: result?.observation ?? 'Tarefa concluída.', tool: result?.tool ?? 'local', result: result?.result ?? result });
        if (auditService?.record) await auditService.record({ runId: run.id, task: agentName, tool: result?.tool ?? 'local', observation: result?.observation ?? {}, result: result?.result ?? result, confidence: result?.confidence ?? 'média', reason: result?.reason ?? 'Resultado do agente local.' });
        runService.appendEvent({ runId: run.id, type: 'autopilot.task.completed', payload: { task: agentName, result: safeResult(result) } });
        if (memoryService?.recordExecution) await memoryService.recordExecution({ runId: run.id, objective, status: 'running', checkpoint: PLAN[index + 1] ?? 'concluído' });
        saveContext(context);
      }
      const completion = classifyCompletion({ goalsMet: input.goalsMet === true, explicitClose: input.explicitClose === true });
      if (!completion.complete && mode !== 'fixture') {
        runService.appendEvent({ runId: run.id, type: 'autopilot.turn.completed', payload: { level: 'task' } });
        return { run: runService.getRun?.(run.id) ?? run, plan, status: 'running', message: 'Turno concluído. A campanha continua com a próxima tarefa autorizada.' };
      }
      const finished = runService.finishRun ? runService.finishRun(run.id, 'succeeded', 'Jornada concluída com resultados confirmados.') : { ...run, status: 'succeeded' };
      runService.appendEvent({ runId: run.id, type: 'autopilot.completed', payload: { status: 'succeeded' } });
      return { run: finished, plan, status: 'succeeded', message: 'A jornada foi concluída com resultados confirmados.' };
    } catch (error) {
      const classified = classifyError(error);
      const failedPlan = plan.find((step) => step.status === 'running'); if (failedPlan) failedPlan.status = 'needs_attention';
      if (runService.setPlan) runService.setPlan(run.id, plan);
      if (runService.pauseRun) { try { runService.pauseRun(run.id, error.message); } catch {} }
      runService.appendEvent({ runId: run.id, type: 'autopilot.exception', payload: { task: failedPlan?.id ?? '', message: error.message, retryable: classified.retryable, action: classified.action } });
      if (memoryService?.recordExecution) await memoryService.recordExecution({ runId: run.id, objective, status: 'needs_attention', checkpoint: failedPlan?.id ?? '' });
      saveContext(context);
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
