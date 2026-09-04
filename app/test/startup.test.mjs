import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

test('package exposes the local app entrypoint', async () => {
  const packageJson = JSON.parse(await readFile(join(import.meta.dirname, '..', 'package.json'), 'utf8'));

  assert.equal(packageJson.scripts.start, 'node --disable-warning=ExperimentalWarning src/main.mjs');
});
