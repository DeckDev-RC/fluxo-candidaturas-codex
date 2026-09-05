export const COMPLETION_LEVELS = ['turn', 'task', 'application', 'campaign'];

export function classifyCompletion({ emptyQueue = false, gap = false, modelSaidDone = false, goalsMet = false, explicitClose = false, applicationConfirmed = false, taskDone = false, turnDone = false } = {}) {
  if (explicitClose || goalsMet) return { level: 'campaign', complete: true, reason: explicitClose ? 'Encerramento explícito.' : 'Metas persistidas atingidas.' };
  if (applicationConfirmed) return { level: 'application', complete: true, reason: 'Candidatura confirmada e registrada.' };
  if (taskDone) return { level: 'task', complete: true, reason: 'Tarefa persistida concluída.' };
  if (turnDone) return { level: 'turn', complete: true, reason: 'Turno do modelo concluído.' };
  if (emptyQueue || gap || modelSaidDone) {
    return { level: null, complete: false, reason: 'Fila vazia, lacuna ou mensagem do modelo não representa objetivo atingido.' };
  }
  return { level: null, complete: false, reason: 'A jornada continua.' };
}
