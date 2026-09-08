import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuntimeConfig } from '../src/runtime-config.mjs';

test('runtime config reads safe operational controls and omits credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-config-'));
  await writeFile(join(root, '.env'), [
    'REQUIRE_FINAL_CONFIRMATION=true',
    'ALLOW_AUTOMATED_SUBMISSION=false',
    'MAX_APPLICATIONS_PER_RUN=12',
    'MAX_CONSECUTIVE_FAILURES=3',
    'EVIDENCE_MODE=confirmation',
    'CONVERSATION_PROVIDER=codex',
    'CONVERSATION_PROVIDER=skynet',
    'INFOJOBS_URL=https://www.infojobs.com.br/vagas.aspx?palabra={q}',
    'GUPY_PASSWORD=must-not-leak'
  ].join('\n'));

  const config = await readRuntimeConfig(root);

  assert.equal(config.requireFinalConfirmation, true);
  assert.equal(config.allowAutomatedSubmission, false);
  assert.equal(config.maxApplicationsPerRun, 12);
  assert.equal(config.maxConsecutiveFailures, 3);
  assert.equal(config.evidenceMode, 'confirmation');
  assert.equal(config.conversationProvider, 'skynet');
  assert.deepEqual(config.platformUrls, { INFOJOBS: 'https://www.infojobs.com.br/vagas.aspx?palabra={q}' });
  assert.equal(JSON.stringify(config).includes('must-not-leak'), false);
  assert.deepEqual(Object.keys(config).sort(), [
    'allowAutomatedSubmission', 'authMode', 'browserAutomationRequired',
    'checkpointAfterEachAction', 'cloudEnabled', 'cloudModel', 'codexCommand', 'conversationProvider', 'evidenceMode',
    'followUpMinIntervalMs',
    'localModel', 'maxApplicationsPerRun', 'maxConsecutiveFailures',
    'maxRunDurationMs', 'maxRunTokens', 'maxTaskAttempts',
    'modelProvider', 'platformUrls', 'playwrightHeadless', 'playwrightSession',
    'requireFinalConfirmation'
  ]);
});

test('runtime config returns safe defaults without env file', async () => {
  const config = await readRuntimeConfig(await mkdtemp(join(tmpdir(), 'fluxo-harness-config-')));

  assert.equal(config.requireFinalConfirmation, true);
  assert.equal(config.allowAutomatedSubmission, false);
  assert.equal(config.maxApplicationsPerRun, 30);
  assert.equal(config.authMode, 'chatgpt');
  assert.equal(config.conversationProvider, 'skynet');
});
