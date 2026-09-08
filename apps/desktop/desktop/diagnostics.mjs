import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function diagnose({ probe = probeCommand, browserAvailable = hasBrowser } = {}) {
  const checks = [{ id: 'node', label: 'Runtime local', ok: Number(process.versions.node.split('.')[0]) >= 24, action: 'Instale a versão atual do Fluxo (ou Node.js 24+ no modo web).' }];
  for (const [id, label, command, action] of [
    ['powershell', 'PowerShell 7', 'pwsh', 'Instale PowerShell 7 e reabra o Fluxo.'],
    ['codex', 'Codex CLI', 'codex', 'Instale o Codex CLI e conclua o login na área Codex do aplicativo.']
  ]) {
    const result = await probe(command, ['--version']);
    checks.push({ id, label, ok: result.ok === true, action });
  }
  checks.push({ id: 'browser', label: 'Chromium para automação', ok: await browserAvailable(), action: 'No código-fonte, execute npm run browser:install. No desktop, use Instalar navegador no menu Fluxo.' });
  return { checkedAt: new Date().toISOString(), checks, capabilities: { offline: true, scripts: checks.find(x => x.id === 'powershell').ok, automation: checks.every(x => x.ok) } };
}

async function hasBrowser() { try { const { chromium } = await import('playwright'); await access(chromium.executablePath()); return true; } catch { return false; } }

export function probeCommand(command, args, timeoutMs = 8000) {
  return new Promise(resolve => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: 'ignore' });
    let settled = false;
    const timer = setTimeout(() => { child.kill(); done(false); }, timeoutMs);
    function done(ok) { if (settled) return; settled = true; clearTimeout(timer); resolve({ ok }); }
    child.once('error', () => done(false)); child.once('close', code => done(code === 0));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await diagnose(), null, 2));
}
