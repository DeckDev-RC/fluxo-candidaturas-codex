import { spawn } from 'node:child_process';

export function createPlaywrightCliDriver({ session = 'candidaturas', execute = createDefaultExecutor(session) } = {}) {
  return {
    async snapshot() {
      const result = await execute(['snapshot']);
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
      return { text, challenge: detectChallenge(text) };
    },

    async fill(ref, value) {
      return execute(['fill', String(ref), String(value)]);
    },

    async click(ref) {
      return execute(['click', String(ref)]);
    },

    async state() {
      return this.snapshot();
    }
  };
}

function createDefaultExecutor(session) {
  return (commands) => new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', '--package', '@playwright/cli', 'playwright-cli', '--session', session, ...commands], {
      shell: false,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

function detectChallenge(text) {
  if (/captcha/i.test(text)) return 'captcha';
  if (/\bmfa\b|two-factor|two factor|autentica[çc][ãa]o multifator/i.test(text)) return 'mfa';
  if (/biometr/i.test(text)) return 'biometric';
  return null;
}
