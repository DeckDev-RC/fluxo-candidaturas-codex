import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMutationRunner } from '../src/mutation-runner.mjs';

test('mutation runner records lifecycle, backup and before/after hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-mutation-'));
  const targetPath = join(root, 'campanha.json');
  await writeFile(targetPath, '{"version":1}', 'utf8');
  const operations = [];
  const runner = createMutationRunner({ rootDir: root, store: fakeStore(operations) });
  const result = await runner.runMutation({ kind: 'campaign.update', aggregateType: 'campaign', aggregateId: 'campaign', targetPath, execute: async () => writeFile(targetPath, '{"version":2}', 'utf8'), verify: async () => JSON.parse(await readFile(targetPath, 'utf8')) });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.data.version, 2);
  assert.equal(operations[0].status, 'succeeded');
  assert.notEqual(operations[0].beforeHash, operations[0].afterHash);
  await access(`${targetPath}.bak`);
});

test('mutation runner marks failed operations for reconciliation and blocks the aggregate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-mutation-'));
  const operations = [];
  const runner = createMutationRunner({ rootDir: root, store: fakeStore(operations) });
  await assert.rejects(() => runner.runMutation({ kind: 'queue.add', aggregateType: 'queue', aggregateId: 'q-1', execute: async () => { throw new Error('boom'); } }), (error) => error.code === 'mutation_needs_reconcile');
  assert.equal(operations[0].status, 'needs_reconcile');
  assert.equal(operations[0].blocked, true);
});

function fakeStore(operations) {
  return { startOperation(input) { const operation = { id: `op-${operations.length + 1}`, ...input, status: 'pending', blocked: false }; operations.push(operation); return operation; }, updateOperation(id, patch) { Object.assign(operations.find((item) => item.id === id), patch); return operations.find((item) => item.id === id); }, isAggregateBlocked() { return false; } };
}
