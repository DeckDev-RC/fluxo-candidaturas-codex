// Do mais estreito ao mais amplo: turno do modelo, tarefa, candidatura, campanha.
export const COMPLETION_LEVELS = ['turn', 'task', 'application', 'campaign'];

export function classifyCompletion({ emptyQueue = false, gap = false, modelSaidDone = false, goalsMet = false, explicitClose = false, applicationConfirmed = false, taskDone = false, turnDone = false } = {}) {
  if (explicitClose || goalsMet) return concluido('campaign', explicitClose ? 'Encerramento explícito.' : 'Metas persistidas atingidas.');
  if (applicationConfirmed) return concluido('application', 'Candidatura confirmada e registrada.');
  if (taskDone) return concluido('task', 'Tarefa persistida concluída.');
  if (turnDone) return concluido('turn', 'Turno do modelo concluído.');
  if (emptyQueue || gap || modelSaidDone) {
    return { level: null, complete: false, reason: 'Fila vazia, lacuna ou mensagem do modelo não representa objetivo atingido.' };
  }
  return { level: null, complete: false, reason: 'A jornada continua.' };
}

// Nível fora da escala anunciada é erro de programação, não estado do produto.
function concluido(level, reason) {
  const posicao = COMPLETION_LEVELS.indexOf(level);
  if (posicao < 0) throw Object.assign(new Error(`Nível de conclusão não anunciado: ${level}.`), { code: 'completion_level_unsupported' });
  return { level, complete: true, reason, scope: COMPLETION_LEVELS.slice(0, posicao + 1) };
}
