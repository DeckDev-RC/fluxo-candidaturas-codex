import { createDomainError } from './domain/errors.mjs';

export function createBrowserLease() {
  let owner = null;

  return {
    owner() { return owner; },
    acquire(taskId) {
      const id = String(taskId ?? '');
      if (!id) throw createDomainError('browser_lease_required', 'A sessão do navegador exige um dono de tarefa.');
      if (owner && owner !== id) throw createDomainError('browser_lease_held', 'Outra tarefa já possui a sessão do navegador.');
      owner = id;
      return { taskId: id };
    },
    release(taskId) {
      if (owner === String(taskId ?? '')) owner = null;
    },
    assertOwner(taskId) {
      if (owner !== String(taskId ?? '')) {
        throw createDomainError('browser_lease_mismatch', 'Agentes não preenchem nem enviam a página de outra tarefa.');
      }
    }
  };
}
