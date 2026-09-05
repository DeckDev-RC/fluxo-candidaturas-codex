export function createAgentEventHandler(runService) {
  return (message, runId) => {
    if (!runId) return;
    runService.appendEvent({ runId, type: message.method || 'agent.notification', payload: message.params ?? {}, actorType: 'agent' });
    const turn = message.params?.turn;
    if (message.method !== 'turn/completed' || !turn || runService.getRun(runId)?.status !== 'running') return;
    if (turn.status === 'completed') runService.recordTask(runId, { task: 'awaiting_input', observation: 'Turno concluído; a jornada permanece disponível para revisão e continuidade.', tool: 'agent' });
    else runService.pauseRun(runId, turn.status === 'interrupted' ? 'turno interrompido' : 'falha do agente');
  };
}
