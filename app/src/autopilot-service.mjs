const DEFAULT_PLAN = [
  ['profile', 'Entender seu perfil e completar o que faltar'],
  ['discovery', 'Pesquisar oportunidades compatíveis'],
  ['fit', 'Comparar aderência, prioridade e duplicidade'],
  ['applications', 'Preparar e conduzir candidaturas elegíveis'],
  ['followup', 'Acompanhar respostas, testes, entrevistas e prazos']
];

export function createAutopilotService({ runService, agentAdapter, orchestrator, productionOrchestrator }) {
  return {
    async start(input = {}) {
      if (orchestrator && (input.mode === 'fixture' || input.fixture === true)) return orchestrator.start({ objective: input.intent ?? input.targetRoles ?? '', mode: 'fixture', input });
      if (productionOrchestrator) return productionOrchestrator.start({ objective: input.intent ?? input.targetRoles ?? '', mode: 'autonomous', input });
      if (orchestrator && input.mode !== 'fixture') return orchestrator.start({ objective: input.intent ?? input.targetRoles ?? '', mode: 'autonomous', input });
      const run = runService.startRun({ kind: 'autopilot', platform: '', goal: String(input.targetRoles ?? '').trim(), mode: 'autonomous' });
      const plan = DEFAULT_PLAN.map(([id, label], index) => ({ id, label, status: index === 0 ? 'running' : 'pending' }));
      const timeline = [
        { status: 'succeeded', message: 'Entendi o objetivo e montei o plano da jornada.' },
        { status: 'succeeded', message: 'Conectei o contexto ao App Server local.' },
        { status: 'running', message: 'A IA começou a executar as etapas.' }
      ];
      runService.appendEvent({ runId: run.id, type: 'autopilot.plan.created', payload: { plan } });
      if (!agentAdapter) throw domainError('agent_unavailable', 'App Server local não está configurado.');
      const threadResult = await agentAdapter.startThread({ metadata: { mode: 'fluxo-autopilot', runId: run.id, input: redactInput(input) } });
      const threadId = threadResult?.thread?.id ?? '';
      if (threadId && runService.setAgentThread) runService.setAgentThread(run.id, threadId);
      runService.appendEvent({ runId: run.id, type: 'autopilot.thread.started', payload: { threadId } });
      Promise.resolve(agentAdapter.runTurnForRun(run.id, threadId, buildPrompt(input))).then((turn) => {
        const turnId = turn?.turn?.id ?? '';
        if (turnId && runService.setCurrentTurn) runService.setCurrentTurn(run.id, turnId);
        runService.appendEvent({ runId: run.id, type: 'autopilot.started', payload: { threadId, turnId } });
      }).catch((error) => {
        runService.appendEvent({ runId: run.id, type: 'autopilot.failed', payload: { threadId, error: String(error?.message ?? error) } });
      });
      return { run, plan, timeline, thread: threadResult?.thread ?? {}, status: 'running' };
    }
  };
}

function buildPrompt(input) {
  const intent = String(input.intent ?? input.targetRoles ?? '').trim() || 'identificar o melhor objetivo profissional a partir do currículo';
  const platforms = Array.isArray(input.platforms) && input.platforms.length ? input.platforms.join(', ') : 'as plataformas locais elegíveis';
  const resume = String(input.resumePath ?? '').trim() || 'o currículo local disponível';
  return `Atue como o Autopilot do Fluxo. O objetivo original do usuário é: ${intent}. Use ${resume} e ${platforms}. Primeiro extraia e complete o perfil com o menor número de perguntas. Depois descubra vagas, calcule aderência, prepare candidaturas, registre evidências e acompanhe pendências. Execute as etapas em ordem, relate progresso e peça intervenção somente quando houver uma exceção ou uma decisão que dependa do usuário.`;
}

function redactInput(input) { return { targetRoles: String(input.targetRoles ?? '').trim(), platforms: Array.isArray(input.platforms) ? input.platforms.map((value) => String(value).toUpperCase()).slice(0, 10) : [] }; }
function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
