import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer as createHttpServer } from 'node:http';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';
import { createLocalRuntime } from '../app/src/runtime.mjs';
import { createOnboardingService } from '../app/src/onboarding-service.mjs';
import { createCodexAuthService } from '../app/src/codex-auth-service.mjs';
import { createServer } from '../app/src/http-server.mjs';
import { readFluxoState } from '../app/src/state-reader.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(repository, 'output', 'playwright', 'e2e');
const profile = {
  name: 'Pessoa Sintética E2E', email: 'fixture@example.test', phone: '11900000000',
  location: 'São Paulo', targetRoles: 'Engenharia de software', seniority: 'Júnior',
  technicalFocus: 'JavaScript', workModes: 'Remoto', acceptedLocations: 'Brasil',
  contracts: 'CLT', minimumSalary: '3000', availability: 'Imediata', education: 'Curso sintético',
  languages: 'Português', professionalSummary: 'Perfil fictício para teste local de JavaScript.',
  strengths: 'JavaScript', workAuthorization: 'Brasil', travel: 'Não', pcd: 'Não informar',
  resumePath: 'curriculo/synthetic-resume.txt',
  campaign: { name: 'Campanha E2E sintética', totalGoal: 3, dailyGoal: 3, weeklyGoal: 3,
    platforms: [{ name: 'INFOJOBS', enabled: true, goal: 3 }] }
};

// Catches loss of observed identity, skipped approval, missing screenshot/SQLite writes,
// duplicate submission after restart, and follow-up accidentally reading legacy JSON.
test('real Chromium: onboarding to confirmed SQLite application, restart and follow-up', { timeout: 120_000 }, async (t) => {
  const fixture = await makeFixture(t);
  let runtime = await createLocalRuntime({ rootDir: fixture.root, headless: true });
  t.after(async () => { await runtime.close(); await removeSyntheticRoot(fixture.root); });
  await onboard(runtime, fixture.root);
  assert.equal(await runtime.persistence.getMode(), 'sqlite');
  assert.equal((await readFluxoState(fixture.root)).campaign.totalGoal, 3);
  const discovered = await runtime.discoveryService.discover({ platforms: ['INFOJOBS'], searchUrl: `${fixture.url}/jobs` });
  assert.deepEqual(discovered.failures, []);
  assert.equal(discovered.created.length, 3);
  assert.equal(discovered.created[0].company, 'Empresa Sintética 1');
  const shortlist = runtime.fitService.shortlist({ opportunities: discovered.created, facts: { technicalFocus: { value: 'JavaScript', confirmed: true } } });
  assert.equal(shortlist.items.length, 3);
  assert.equal(shortlist.items[0].fit.eligible, true);
  const item = shortlist.items.find(item => item.identifierOrUrl.endsWith('/jobs/1'));
  const prepared = await runtime.applicationFlow.prepareNext({ itemId: item.id });
  assert.match(prepared.snapshot.text, /Engenharia de software/);
  await runtime.applicationFlow.fillConfirmed(prepared, {
    name: { value: profile.name, confirmed: true },
    email: { value: profile.email, confirmed: true },
    note: { value: 'NÃO DEVE SER PREENCHIDO', confirmed: false }
  });
  assert.equal(prepared.snapshot.formValues.name, profile.name);
  assert.equal(prepared.snapshot.formValues.email, profile.email);
  assert.equal(prepared.snapshot.formValues.note, '');
  const payload = { queueItemId: prepared.item.id, resume: profile.resumePath };
  const approval = runtime.applicationFlow.requestSubmissionApproval(prepared.run.id, payload);
  await assert.rejects(runtime.applicationFlow.submitApproved(prepared, approval.id, payload), { code: 'approval_required' });
  assert.equal(fixture.submissions.length, 0);
  const decision = runtime.approvalService.decideApproval(approval.id,
    { decision: 'approved', reason: 'Explicit simulated local user approval in E2E' },
    { actorType: 'user', actorId: 'synthetic-e2e-user' });
  assert.equal(decision.decisionActorType, 'user');
  const result = await runtime.applicationFlow.submitApproved(prepared, approval.id, payload);
  assert.equal(result.confirmation.confirmed, true);
  assert.equal(fixture.submissions.length, 1);
  assert.equal(fixture.submissions[0].fields.name, profile.name);
  assert.equal(fixture.submissions[0].fields.email, profile.email);
  assert.equal(result.application.status, 'enviada');
  const screenshot = await readFile(join(fixture.root, result.application.evidencePath));
  assert.deepEqual([...screenshot.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(screenshot.length > 1000);
  await writeFile(join(artifacts, 'confirmed-application.png'), screenshot);
  const database = new DatabaseSync(join(fixture.root, 'estado', 'fluxo.sqlite'), { readOnly: true });
  try {
    const stored = JSON.parse(database.prepare("select payload_json from operational_documents where name = 'applications'").get().payload_json);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].id, result.application.id);
    assert.equal(stored[0].evidenceMetadata[0].size, screenshot.length);
  } finally { database.close(); }
  await assert.rejects(readFile(join(fixture.root, 'candidaturas', 'candidaturas.json')), { code: 'ENOENT' });
  await runtime.close();
  runtime = await createLocalRuntime({ rootDir: fixture.root, headless: true });
  const state = await readFluxoState(fixture.root);
  assert.equal(state.applications.confirmedCount, 1);
  assert.equal(state.queue.items.find(entry => entry.id === item.id).status, 'processada');
  assert.equal(runtime.runService.getRun(prepared.run.id).submittedCount, 1);
  assert.equal(runtime.applicationFlow.getWorkflow(prepared.run.id).phase, 'recorded');
  const replay = await runtime.applicationFlow.submitApproved(prepared, approval.id, payload);
  assert.equal(replay.application.id, result.application.id);
  assert.equal(fixture.submissions.length, 1, 'restart must never re-click an already recorded submission');
  const followup = await runtime.followUpMonitor.check();
  assert.deepEqual(followup.failures, []);
  assert.equal(followup.alerts.length, 1);
  assert.equal(followup.alerts[0].status, 'entrevista');
  assert.equal((await runtime.followUpMonitor.check()).newEvents.length, 0);
  await uiSmoke(t, runtime, fixture.root);
});

for (const [id, description] of [['2', 'negative confirmation'], ['3', 'ambiguous confirmation']]) {
  // Catches acceptance of a negative/conditional sentence and submission retry after uncertainty.
  test(`real Chromium: ${description} never increments application count`, { timeout: 90_000 }, async (t) => {
    const fixture = await makeFixture(t);
    const runtime = await createLocalRuntime({ rootDir: fixture.root, headless: true });
    t.after(async () => { await runtime.close(); await removeSyntheticRoot(fixture.root); });
    await onboard(runtime, fixture.root);
    const discovered = await runtime.discoveryService.discover({ platforms: ['INFOJOBS'], searchUrl: `${fixture.url}/jobs` });
    assert.deepEqual(discovered.failures, []);
    const item = discovered.created.find(entry => entry.identifierOrUrl.endsWith(`/jobs/${id}`));
    const prepared = await runtime.applicationFlow.prepareNext({ itemId: item.id });
    const payload = { queueItemId: item.id };
    const approval = runtime.applicationFlow.requestSubmissionApproval(prepared.run.id, payload);
    runtime.approvalService.decideApproval(approval.id, { decision: 'approved' }, { actorType: 'user', actorId: 'synthetic-e2e-user' });
    await assert.rejects(runtime.applicationFlow.submitApproved(prepared, approval.id, payload), { code: 'submission_not_confirmed' });
    assert.equal((await runtime.persistence.getApplications()).length, 0);
    assert.equal((await readFluxoState(fixture.root)).applications.confirmedCount, 0);
    assert.equal(runtime.runService.getRun(prepared.run.id).submittedCount, 0);
    assert.equal(runtime.applicationFlow.getWorkflow(prepared.run.id).phase, 'needs_reconcile');
    assert.equal(fixture.submissions.length, 1);
    await assert.rejects(runtime.applicationFlow.submitApproved(prepared, approval.id, payload));
    assert.equal(fixture.submissions.length, 1, 'uncertain submission must not be clicked again');
    await runtime.browserAdapter.captureEvidence({ runId: `negative-${id}`, item });
    await copyFile(join(fixture.root, `evidencias/negative-${id}-confirmacao.png`), join(artifacts, `response-${id}.png`));
  });
}

async function onboard(runtime, root) {
  const onboarding = createOnboardingService({ rootDir: root, persistence: runtime.persistence, memoryService: runtime.memoryService });
  await onboarding.saveOnboarding(profile);
  // Synthetic prerequisite only: this suite tests the real browser + runtime + SQLite.
  // OS/Codex/install preflight has separate production tests; no credentials are used here.
  await writeFile(join(root, 'estado', 'preflight.json'), JSON.stringify({ ready: true, fixture: 'controlled-browser-e2e', checks: [] }));
}

async function makeFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-real-browser-e2e-'));
  await mkdir(artifacts, { recursive: true });
  for (const directory of ['scripts', 'config', 'templates']) await cp(join(repository, directory), join(root, directory), { recursive: true });
  await copyFile(join(repository, '.env.example'), join(root, '.env.example'));
  await mkdir(join(root, 'curriculo'), { recursive: true });
  await writeFile(join(root, profile.resumePath), 'Pessoa Sintética E2E\nJavaScript\nfixture@example.test\n');
  const submissions = [];
  const server = createHttpServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('content-type', 'text/html; charset=utf-8');
    if (url.pathname === '/jobs') return response.end(page('Oportunidades sintéticas', [1, 2, 3].map(id => `<article data-job data-company="Empresa Sintética ${id}"><a href="/jobs/${id}">Engenharia de software ${id}</a></article>`).join('')));
    if (url.pathname === '/status') return response.end(page('Acompanhamento', '<p data-application-status="entrevista">Convite para entrevista — cenário sintético.</p>'));
    const job = url.pathname.match(/^\/jobs\/([123])$/)?.[1];
    if (!job) { response.statusCode = 404; return response.end('Not found'); }
    if (request.method === 'POST') {
      let body = ''; for await (const chunk of request) body += chunk;
      submissions.push({ id: job, fields: Object.fromEntries(new URLSearchParams(body)) });
      const text = { 1: 'Candidatura enviada', 2: 'Candidatura não enviada. O envio falhou.', 3: 'Sua candidatura será enviada quando a revisão terminar.' }[job];
      return response.end(page('Resultado da candidatura', `<p data-confirmation data-job-id="${job}">${text}</p><a href="/status">Acompanhar candidatura</a>`));
    }
    if (job === '1' && submissions.some(item => item.id === '1')) { response.writeHead(302, { location: '/status' }); return response.end(); }
    response.end(page(`Engenharia de software ${job}`, `<form method="post"><label>Nome<input name="name" data-fluxo-ref="name"></label><label>E-mail<input name="email" type="email" data-fluxo-ref="email"></label><label>Observação<textarea name="note" data-fluxo-ref="note"></textarea></label><button type="submit">Enviar candidatura</button></form>`));
  });
  await listen(server);
  t.after(async () => { await close(server); });
  return { root, url: `http://127.0.0.1:${server.address().port}`, submissions };
}

async function uiSmoke(t, runtime, rootDir) {
  // Real auth service pointed at an absent executable isolates the user's Codex login.
  const authService = createCodexAuthService({ command: join(rootDir, 'intentionally-absent-codex.exe') });
  const server = createServer({ rootDir, authService, queueService: runtime.queueService, runService: runtime.runService, approvalService: runtime.approvalService, stateStore: runtime.stateStore, applicationFlow: runtime.applicationFlow, memoryService: runtime.memoryService });
  await listen(server);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#primary-nav a[href="#queue"]').click();
    await page.waitForFunction(() => document.querySelector('#screen-title')?.textContent.includes('Fila'));
    await page.locator('#queue-list').getByText(/Empresa Sintética 1/).waitFor();
    await page.locator('#primary-nav a[href="#applications"]').click();
    await page.waitForFunction(() => document.querySelector('#screen-title')?.textContent === 'Candidaturas');
    await page.locator('#primary-nav a[href="#followup"]').click();
    await page.waitForFunction(() => document.querySelector('#screen-title')?.textContent.includes('Acompanhamento'));
    await page.screenshot({ path: join(artifacts, 'fluxo-ui-followup.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await close(server); }
}

function page(title, body) { return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${title}</title><style>body{font:20px system-ui;max-width:800px;margin:60px auto;color:#183326}label{display:block;margin:20px 0}input,textarea{display:block;padding:12px}article{margin:30px 0}button{padding:14px}</style><h1>${title}</h1><p>Fixture local. Nenhuma candidatura real.</p>${body}</html>`; }
function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); }
function close(server) { server.closeAllConnections(); return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
async function removeSyntheticRoot(root) {
  assert.equal(dirname(root), resolve(tmpdir()));
  assert.match(root, /fluxo-real-browser-e2e-[^\\/]+$/);
  await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
