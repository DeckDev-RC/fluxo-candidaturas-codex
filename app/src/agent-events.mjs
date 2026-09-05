// Eventos do App Server. Além de registrar o turno, o consumo informado pelo
// runtime é contabilizado no orçamento da campanha: sem isso, o limite de tokens
// existiria na configuração sem proteger nada.
export function createAgentEventHandler(runService, { budget } = {}) {
  return (message, runId) => {
    if (!runId) return;
    runService.appendEvent({ runId, type: message.method || 'agent.notification', payload: message.params ?? {}, actorType: 'agent' });
    const turn = message.params?.turn;
    if (message.method !== 'turn/completed' || !turn || runService.getRun(runId)?.status !== 'running') return;

    const tokens = contarTokens(turn.usage ?? message.params?.usage);
    if (tokens > 0) {
      budget?.recordTokens?.(tokens);
      runService.appendEvent({ runId, type: 'agent.usage.recorded', payload: { tokens, snapshot: budget?.snapshot?.()?.tokens ?? tokens } });
    }

    if (turn.status === 'completed') runService.recordTask(runId, { task: 'awaiting_input', observation: 'Turno concluído; a jornada permanece disponível para revisão e continuidade.', tool: 'agent' });
    else runService.pauseRun(runId, turn.status === 'interrupted' ? 'turno interrompido' : 'falha do agente');
  };
}

// O App Server nomeia os campos de formas diferentes entre versões; nenhuma
// estimativa é inventada quando o runtime não informa consumo.
function contarTokens(usage) {
  if (!usage || typeof usage !== 'object') return 0;
  const direto = Number(usage.totalTokens ?? usage.total_tokens ?? 0);
  if (Number.isFinite(direto) && direto > 0) return direto;
  const entrada = Number(usage.inputTokens ?? usage.input_tokens ?? usage.promptTokens ?? usage.prompt_tokens ?? 0);
  const saida = Number(usage.outputTokens ?? usage.output_tokens ?? usage.completionTokens ?? usage.completion_tokens ?? 0);
  const soma = (Number.isFinite(entrada) ? entrada : 0) + (Number.isFinite(saida) ? saida : 0);
  return soma > 0 ? soma : 0;
}
