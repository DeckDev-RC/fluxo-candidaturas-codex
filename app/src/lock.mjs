import { mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export async function acquireFluxoLock(rootDir) {
  const lockPath = join(rootDir, 'estado', 'harness.lock');
  await mkdir(join(rootDir, 'estado'), { recursive: true });

  let handle;
  try {
    handle = await open(lockPath, 'wx');
    await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }));
  } catch (error) {
    if (handle) await handle.close();
    if (error?.code === 'EEXIST') {
      const locked = new Error('Outra execução do Fluxo já está usando esta raiz.');
      locked.code = 'fluxo_locked';
      throw locked;
    }
    throw error;
  }

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await handle.close();
    await unlink(lockPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  };
}

export function wrapMutations(service, names, { rootDir, mutationLock = true, lock = () => acquireFluxoLock(rootDir) } = {}) {
  if (!mutationLock || !rootDir) { service.handlesMutationLock = false; return service; }
  for (const name of names) {
    const operation = service[name];
    service[name] = async (...args) => { const release = await lock(); try { return await operation.apply(service, args); } finally { await release(); } };
  }
  service.handlesMutationLock = true;
  return service;
}
