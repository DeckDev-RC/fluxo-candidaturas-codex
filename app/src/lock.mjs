import { mkdir, open, unlink, readFile } from 'node:fs/promises';
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
      let recovery;
      let ownPid = false;
      try {
        recovery = await open(`${lockPath}.recovery`, 'wx');
        const owner = JSON.parse(await readFile(lockPath, 'utf8'));
        ownPid = owner.pid === process.pid;
        if (Number.isInteger(owner.pid) && owner.pid > 0 && !ownPid) {
          let dead = false;
          try { process.kill(owner.pid, 0); } catch (error) { dead = error.code === 'ESRCH'; }
          if (dead) {
            await unlink(lockPath);
            return await acquireFluxoLock(rootDir);
          }
        }
      } catch (recoveryError) {
        if (!['EEXIST', 'ENOENT'].includes(recoveryError.code) && !(recoveryError instanceof SyntaxError)) throw recoveryError;
      } finally { if (recovery) { await recovery.close(); await unlink(`${lockPath}.recovery`).catch(() => {}); } }
      // A trava é por processo: quando o dono é este mesmo processo, não há "outra
      // execução" — há outra operação ainda em andamento, e a mensagem precisa dizer isso.
      const locked = new Error(ownPid
        ? 'O Fluxo ainda está concluindo outra operação. Aguarde alguns segundos e tente de novo.'
        : 'Outra execução do Fluxo já está usando esta raiz.');
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
