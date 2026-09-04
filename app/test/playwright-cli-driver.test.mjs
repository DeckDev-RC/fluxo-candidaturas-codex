import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaywrightCliDriver } from '../src/playwright-cli-driver.mjs';

test('Playwright CLI driver keeps the dedicated session and command arguments', async () => {
  const calls = [];
  const driver = createPlaywrightCliDriver({
    session: 'candidaturas-test',
    async execute(args) {
      calls.push(args);
      return { exitCode: 0, stdout: 'Página de candidatura', stderr: '' };
    }
  });

  await driver.snapshot();
  await driver.fill('e12', 'Pessoa Teste');
  await driver.click('e13');

  assert.deepEqual(calls, [
    ['snapshot'],
    ['fill', 'e12', 'Pessoa Teste'],
    ['click', 'e13']
  ]);
});

test('Playwright CLI driver marks CAPTCHA and MFA output as manual challenges', async () => {
  const driver = createPlaywrightCliDriver({
    async execute() { return { exitCode: 0, stdout: 'MFA necessário', stderr: '' }; }
  });

  const snapshot = await driver.snapshot();

  assert.equal(snapshot.challenge, 'mfa');
});
