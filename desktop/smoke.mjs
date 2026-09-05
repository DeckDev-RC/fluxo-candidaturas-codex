import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const userData = await mkdtemp(join(tmpdir(), 'fluxo-desktop-smoke-'));
const output = resolve('output/playwright/desktop');
await mkdir(output, { recursive: true });
const env = { ...process.env, FLUXO_DESKTOP_USER_DATA: userData };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.FLUXO_PACKAGED_EXE;
const app = await electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: [resolve('.')] }), env, timeout: 30_000 });
try {
  const window = await app.firstWindow();
  await window.waitForURL('http://127.0.0.1:*/', { timeout: 30_000 });
  // A área de trabalho da pessoa é o alvo: se ela não pinta, o app não abriu de fato.
  await window.locator('#conteudo').waitFor();
  await window.locator('#objetivo-texto').waitFor();
  const isolation = await window.evaluate(() => ({ require: typeof require, desktop: typeof window.fluxoDesktop?.diagnostics }));
  assert.deepEqual(isolation, { require: 'undefined', desktop: 'function' });
  const workspace = await window.evaluate(() => window.fluxoDesktop.workspace());
  assert.equal(workspace.rootDir, join(userData, 'workspace'));
  const diagnostics = await window.evaluate(() => window.fluxoDesktop.diagnostics());
  assert.equal(diagnostics.capabilities.offline, true);
  if (process.env.FLUXO_VERIFY_BROWSER_INSTALL === '1') assert.equal((await window.evaluate(() => window.fluxoDesktop.installBrowser())).installed, true);
  const url = window.url();
  assert.equal((await fetch(`${url}health`)).status, 200);
  const marker = join(workspace.rootDir, 'perfil', 'smoke-preservation.txt');
  await writeFile(marker, 'preservar', 'utf8');
  await window.screenshot({ path: join(output, executablePath ? 'packaged.png' : 'development.png'), fullPage: true });
  await writeFile(join(output, executablePath ? 'packaged-report.json' : 'development-report.json'), JSON.stringify({ ok: true, mode: executablePath ? 'packaged' : 'development', isolation, diagnostics, dataOutsideInstall: true }, null, 2));
  await app.close();
  assert.equal(await readFile(marker, 'utf8'), 'preservar');
  await assert.rejects(fetch(`${url}health`));
  console.log(`Desktop ${executablePath ? 'empacotado' : 'desenvolvimento'}: abriu, leu offline, isolou renderer, preservou dados e encerrou backend.`);
} finally { await app.close().catch(() => {}); }
