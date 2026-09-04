import { spawn } from 'node:child_process';

export function createPlaywrightCliDriver({ session = 'candidaturas', cwd, execute = createDefaultExecutor(session, cwd) } = {}) {
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
    },

    async screenshot(path) {
      return execute(['screenshot', '--filename', String(path)]);
    }
  };
}

function createDefaultExecutor(session, cwd) {
  return (commands) => new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', '--package', '@playwright/cli', 'playwright-cli', '--session', session, ...commands], {
      shell: false, cwd,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr, ok: exitCode === 0 }));
  });
}

function detectChallenge(text) {
  if (/captcha/i.test(text)) return 'captcha';
  if (/\bmfa\b|two-factor|two factor|autentica[çc][ãa]o multifator/i.test(text)) return 'mfa';
  if (/biometr/i.test(text)) return 'biometric';
  return null;
}
