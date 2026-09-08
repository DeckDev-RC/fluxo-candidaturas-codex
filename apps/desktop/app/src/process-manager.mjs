export function createProcessManager({ runService }) {
  const fallback = new Map();
  const executing = new Set();
  return {
    get(runId) { return runService.getWorkflow?.(runId) ?? fallback.get(runId) ?? null; },
    save(runId, patch) {
      const previous = this.get(runId) ?? {};
      const state = { ...previous, ...patch, updatedAt: new Date().toISOString() };
      if (previous.phase === 'recorded' && state.phase !== 'recorded') throw failure('workflow_terminal');
      if (previous.phase === 'confirmed' && ['prepared', 'submitting'].includes(state.phase)) throw failure('confirmation_already_observed');
      if (runService.saveWorkflow) runService.saveWorkflow(runId, state); else fallback.set(runId, state);
      return state;
    },
    async exclusive(runId, operation) {
      if (executing.has(runId)) throw failure('workflow_busy');
      executing.add(runId);
      try { return await operation(); } finally { executing.delete(runId); }
    }
  };
}
function failure(code) { return Object.assign(new Error('A execução já está em outra etapa. Consulte o estado persistido.'), { code }); }
