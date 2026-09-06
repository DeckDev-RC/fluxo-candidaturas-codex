import { mkdir, open, stat, unlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Quando o dono da trava é este mesmo processo (outra operação em curso, como
// a IA lendo uma página), quem chega espera um pouco em vez de falhar na hora:
// um clique de "Aprovar" durante uma busca não deve virar 409.
const ESPERA_PROPRIO_PROCESSO_MS = 3_000;
const INTERVALO_ESPERA_MS = 100;
// Um `.recovery` mais velho que isto ficou órfão de um processo morto no meio.
const RECOVERY_ORFAO_MS = 30_000;

export async function acquireFluxoLock(rootDir, { waitMs = ESPERA_PROPRIO_PROCESSO_MS } = {}) {
  const inicio = Date.now();
  for (;;) {
    try { return await tentarTravar(rootDir); }
    catch (error) {
      if (error?.code !== 'fluxo_locked' || !error.ownPid || Date.now() - inicio >= waitMs) throw error;
      await new Promise((resolve) => setTimeout(resolve, INTERVALO_ESPERA_MS));
    }
  }
}

async function tentarTravar(rootDir) {
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
        await removerRecoveryOrfao(`${lockPath}.recovery`);
        recovery = await open(`${lockPath}.recovery`, 'wx');
        const owner = await lerDono(lockPath);
        ownPid = owner.pid === process.pid;
        if (Number.isInteger(owner.pid) && owner.pid > 0 && !ownPid) {
          let dead = false;
          try { process.kill(owner.pid, 0); } catch (error) { dead = error.code === 'ESRCH'; }
          if (dead) {
            await unlink(lockPath);
            return await tentarTravar(rootDir);
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
      locked.ownPid = ownPid;
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

async function removerRecoveryOrfao(caminho) {
  try {
    const info = await stat(caminho);
    if (Date.now() - info.mtimeMs > RECOVERY_ORFAO_MS) await unlink(caminho).catch(() => {});
  } catch { /* não existe */ }
}

// Entre criar o arquivo e gravar o dono há um instante em que ele está vazio;
// quem lê nesse instante espera um pouco em vez de concluir que é outro processo.
async function lerDono(lockPath, tentativas = 8) {
  for (let i = 0; i < tentativas; i += 1) {
    try { return JSON.parse(await readFile(lockPath, 'utf8')); }
    catch (error) {
      if (error?.code === 'ENOENT') throw error;
      if (!(error instanceof SyntaxError) || i === tentativas - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new SyntaxError('lock vazio');
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
