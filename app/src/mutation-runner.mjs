import { copyFile, mkdir, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { acquireFluxoLock } from './lock.mjs';

export function createMutationRunner({ rootDir, store, lock = () => acquireFluxoLock(rootDir) }) {
  return {
    async runMutation({ kind, aggregateType, aggregateId, targetPath = '', execute, verify = async () => null } = {}) {
      if (store.isAggregateBlocked?.(aggregateType, aggregateId)) throw domainError('aggregate_blocked', 'O agregado está bloqueado até reconciliação.');
      const release = await lock();
      let operation;
      try {
        operation = store.startOperation({ kind, aggregateType, aggregateId, input: {}, beforeHash: await hashFile(targetPath) });
        store.updateOperation(operation.id, { status: 'running' });
        if (targetPath && await exists(targetPath)) await copyFile(targetPath, `${targetPath}.bak`);
        await execute();
        const data = await verify();
        const afterHash = await hashFile(targetPath);
        store.updateOperation(operation.id, { status: 'succeeded', afterHash, result: data, finishedAt: new Date().toISOString() });
        return { ...operation, status: 'succeeded', beforeHash: operation.beforeHash, afterHash, data };
      } catch (error) {
        if (operation) { store.updateOperation(operation.id, { status: 'needs_reconcile', blocked: true, error: String(error.message), finishedAt: new Date().toISOString() }); }
        throw domainError('mutation_needs_reconcile', `Mutação interrompida e marcada para reconciliação: ${error.message}`);
      } finally { await release(); }
    }
  };
}

async function exists(path) { try { await stat(path); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; } }
async function hashFile(path) { if (!path || !(await exists(path))) return ''; const content = await import('node:fs/promises').then(({ readFile }) => readFile(path)); return createHash('sha256').update(content).digest('hex'); }
function domainError(code, message) { const error = new Error(message); error.code = code; error.cause = randomUUID(); return error; }
