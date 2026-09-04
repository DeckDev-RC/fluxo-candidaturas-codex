import { summarizePreflight } from './preflight-summary.js';

const refreshButton = document.querySelector('#refresh');
const preflightButton = document.querySelector('#run-preflight');
const exportButton = document.querySelector('#export-shareable');
const onboardingForm = document.querySelector('#onboarding-form');
const resumeTools = document.querySelector('#resume-tools');
const connectStreamButton = document.querySelector('#connect-run-stream');
const queueSearchForm = document.querySelector('#queue-search');
const queueAddForm = document.querySelector('#queue-add');
const followUpForm = document.querySelector('#follow-up-form');
const legacyImportForm = document.querySelector('#legacy-import-form');
const assessmentPrepForm = document.querySelector('#assessment-prep-form');
const assessmentResultForm = document.querySelector('#assessment-result-form');
const assessmentPauseButton = document.querySelector('#assessment-pause');
const applicationTools = document.querySelector('#application-tools');
let preparedApplication;
let submissionApproval;
let submissionPayload;
let assessmentTimer;
let assessmentRemaining = 0;
let csrfToken = '';
let runEventSource;

refreshButton.addEventListener('click', loadState);
preflightButton.addEventListener('click', runPreflight);
exportButton.addEventListener('click', exportShareable);
onboardingForm.addEventListener('submit', saveOnboarding);
resumeTools.addEventListener('submit', (event) => runResumeOperation(event, 'fit'));
resumeTools.querySelector('[data-operation="select"]').addEventListener('click', () => runResumeOperation(null, 'select'));
resumeTools.querySelector('[data-operation="extract"]').addEventListener('click', () => runResumeOperation(null, 'extract'));
connectStreamButton.addEventListener('click', connectRunStream);
queueSearchForm.addEventListener('submit', searchQueue);
queueAddForm.addEventListener('submit', addQueueItem);
followUpForm.addEventListener('submit', recordFollowUp);
legacyImportForm.addEventListener('submit', importLegacy);
assessmentPrepForm.addEventListener('submit', prepareAssessment);
assessmentResultForm.addEventListener('submit', recordAssessment);
assessmentPauseButton.addEventListener('click', toggleAssessmentTimer);
applicationTools.querySelector('[data-application-action="prepare"]').addEventListener('click', prepareApplication);
applicationTools.querySelector('[data-application-action="approve"]').addEventListener('click', requestApplicationApproval);
applicationTools.querySelector('[data-application-action="submit"]').addEventListener('click', submitApplication);
bootstrapSession().finally(loadState);

async function bootstrapSession() {
  const response = await fetch('/api/v1/auth/session', { cache: 'no-store' });
  if (response.ok) csrfToken = (await response.json()).csrfToken ?? '';
}

function mutationHeaders(extra = {}) { return { ...extra, ...(csrfToken ? { 'x-fluxo-csrf': csrfToken } : {}) }; }

async function loadState() {
  refreshButton.disabled = true;
  refreshButton.classList.add('is-loading');
  try {
    const [response, approvalsResponse, profileResponse, metricsResponse, pendingResponse, assessmentsResponse, platformsResponse] = await Promise.all([
      fetch('/api/v1/state', { cache: 'no-store' }),
      fetch('/api/v1/approvals', { cache: 'no-store' }),
      fetch('/api/v1/profile', { cache: 'no-store' }),
      fetch('/api/v1/metrics', { cache: 'no-store' }),
      fetch('/api/v1/pending', { cache: 'no-store' }),
      fetch('/api/v1/assessments', { cache: 'no-store' }),
      fetch('/api/v1/platforms', { cache: 'no-store' })
    ]);
    if (!response.ok) throw new Error('state_read_failed');
    render(await response.json(), approvalsResponse.ok ? await approvalsResponse.json() : [], profileResponse.ok ? await profileResponse.json() : null,
      metricsResponse.ok ? await metricsResponse.json() : null, pendingResponse.ok ? await pendingResponse.json() : [], assessmentsResponse.ok ? await assessmentsResponse.json() : [], platformsResponse.ok ? await platformsResponse.json() : []);
  } catch {
    renderUnavailable();
  } finally {
    refreshButton.disabled = false;
    refreshButton.classList.remove('is-loading');
  }
}

async function searchQueue(event) {
  event.preventDefault();
  const query = new URLSearchParams(new FormData(queueSearchForm));
  const response = await fetch(`/api/v1/queue/search?${query}`, { cache: 'no-store' });
  if (response.ok) renderQueue({ items: await response.json() });
}

async function addQueueItem(event) {
  event.preventDefault();
  const response = await fetch('/api/v1/queue/items', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(Object.fromEntries(new FormData(queueAddForm))) });
  queueAddForm.querySelector('button').textContent = response.ok ? 'Vaga adicionada' : 'Falha ao adicionar';
  if (response.ok) await loadState();
}

async function recordFollowUp(event) {
  event.preventDefault();
  const input = Object.fromEntries(new FormData(followUpForm));
  const response = await fetch(`/api/v1/applications/${encodeURIComponent(input.reference)}/events`, { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(input) });
  document.querySelector('#follow-up-feedback').textContent = response.ok ? 'Evento registrado.' : 'Não foi possível registrar.';
  if (response.ok) await loadState();
}

async function importLegacy(event) {
  event.preventDefault();
  const response = await fetch('/api/v1/imports/legacy', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(Object.fromEntries(new FormData(legacyImportForm))) });
  document.querySelector('#follow-up-feedback').textContent = response.ok ? 'Controles importados.' : 'Falha na importação.';
  if (response.ok) await loadState();
}

async function prepareAssessment(event) {
  event.preventDefault();
  const input = Object.fromEntries(new FormData(assessmentPrepForm));
  try { input.questions = JSON.parse(input.questionsJson); } catch { document.querySelector('#assessment-feedback').textContent = 'Perguntas devem ser JSON válido.'; return; }
  delete input.questionsJson; input.durationSeconds = Number(input.durationSeconds || 0);
  const response = await fetch('/api/v1/assessments/prepare', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(input) });
  if (!response.ok) { document.querySelector('#assessment-feedback').textContent = 'Não foi possível preparar.'; return; }
  const result = await response.json(); assessmentRemaining = result.durationSeconds ?? 0; assessmentPauseButton.disabled = assessmentRemaining <= 0; updateAssessmentTimer(); clearInterval(assessmentTimer); assessmentTimer = assessmentRemaining > 0 ? setInterval(() => { if (assessmentRemaining > 0 && !assessmentPauseButton.dataset.paused) { assessmentRemaining -= 1; updateAssessmentTimer(); } }, 1000) : null;
  document.querySelector('#assessment-feedback').textContent = 'Questionário preparado; autoria humana exigida.';
}

function toggleAssessmentTimer() { assessmentPauseButton.dataset.paused = assessmentPauseButton.dataset.paused === 'true' ? 'false' : 'true'; assessmentPauseButton.textContent = assessmentPauseButton.dataset.paused === 'true' ? 'Retomar' : 'Pausar'; }
function updateAssessmentTimer() { document.querySelector('#assessment-timer').textContent = assessmentRemaining ? `Tempo informativo: ${assessmentRemaining}s` : 'Sem cronômetro'; }

async function recordAssessment(event) {
  event.preventDefault();
  const response = await fetch('/api/v1/assessments', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(Object.fromEntries(new FormData(assessmentResultForm))) });
  document.querySelector('#assessment-feedback').textContent = response.ok ? 'Resultado registrado.' : 'Não foi possível registrar.';
  if (response.ok) await loadState();
}

async function prepareApplication() {
  const platform = applicationTools.querySelector('[name="platform"]').value;
  const response = await fetch('/api/v1/applications/prepare', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ platform }) });
  const feedback = document.querySelector('#application-feedback');
  if (!response.ok) { feedback.textContent = 'Não foi possível preparar a próxima vaga.'; return; }
  preparedApplication = await response.json();
  const run = preparedApplication.run ?? preparedApplication.data?.run;
  feedback.textContent = `Preparada: ${run?.id ?? 'run criado'}. Revise antes da aprovação.`;
  applicationTools.querySelector('[data-application-action="approve"]').disabled = false;
  document.querySelector('#run-stream-id').value = run?.id ?? '';
}

async function requestApplicationApproval() {
  const run = preparedApplication?.run ?? preparedApplication?.data?.run;
  if (!run?.id) return;
  submissionPayload = { queueItemId: (preparedApplication.item ?? preparedApplication.data?.item)?.id, fields: preparedApplication.snapshot ?? {} };
  const response = await fetch(`/api/v1/applications/${encodeURIComponent(run.id)}/approval`, { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(submissionPayload) });
  const feedback = document.querySelector('#application-feedback');
  if (!response.ok) { feedback.textContent = 'Não foi possível solicitar aprovação.'; return; }
  submissionApproval = await response.json();
  submissionApproval = submissionApproval.data ?? submissionApproval;
  feedback.textContent = 'Aprovação criada; decida no painel de aprovações.';
  applicationTools.querySelector('[data-application-action="submit"]').disabled = false;
}

async function submitApplication() {
  const run = preparedApplication?.run ?? preparedApplication?.data?.run;
  if (!run?.id || !submissionApproval?.id || submissionApproval.status !== 'approved') { document.querySelector('#application-feedback').textContent = 'Aprove a ação no painel antes de confirmar.'; return; }
  const response = await fetch(`/api/v1/applications/${encodeURIComponent(run.id)}/submit`, { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ approvalId: submissionApproval.id, ...submissionPayload }) });
  document.querySelector('#application-feedback').textContent = response.ok ? 'Envio confirmado pela plataforma.' : 'Envio bloqueado; revise aprovação e evidência.';
  if (response.ok) { preparedApplication = null; submissionApproval = null; await loadState(); }
}

function render(state, approvals = [], profile = null, metrics = null, pending = [], assessments = [], registry = []) {
  const ready = state.installation.ready;
  document.querySelector('#installation-status').textContent = ready ? 'Pronto para operar' : 'Atenção necessária';
  document.querySelector('#installation-dot').classList.toggle('is-ready', ready);
  document.querySelector('#preflight-summary').textContent = summarizePreflight(state.preflight);
  document.querySelector('#freshness').textContent = `Leitura local · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  renderMetrics(state);
  renderPlatforms(state.campaign.platforms, registry);
  renderQueue(state.queue);
  renderApplications(state.applications);
  renderCheckpoint(state.checkpoint);
  renderApprovals(approvals);
  renderOnboarding(state, profile);
  renderOperations(metrics, pending, assessments);
}

function renderOperations(metrics, pending, assessments) {
  const metricsContainer = document.querySelector('#metrics-detail');
  const totals = metrics?.totals ?? {};
  metricsContainer.replaceChildren(...[['candidaturas', totals.applications ?? 0], ['confirmadas', totals.confirmed ?? 0], ['na fila', totals.queue ?? 0]].map(([label, value]) => { const item = document.createElement('div'); item.textContent = `${label}: ${value}`; return item; }));
  renderCompact('#pending-list', pending, (item) => `${item.urgency ?? '—'} · ${item.reference ?? 'sem referência'} · ${item.nextAction ?? ''}`);
  renderCompact('#assessment-list', assessments, (item) => `${item.reference ?? '—'} · ${item.name ?? 'teste'} · ${item.status ?? 'sem resultado'}`);
}

function connectRunStream() {
  const runId = document.querySelector('#run-stream-id').value.trim();
  const feedback = document.querySelector('#stream-feedback');
  if (!runId) { feedback.textContent = 'Informe um run ID.'; return; }
  runEventSource?.close();
  const output = document.querySelector('#run-events'); output.textContent = '';
  runEventSource = new EventSource(`/api/v1/runs/${encodeURIComponent(runId)}/events?stream=1`);
  runEventSource.onopen = () => { feedback.textContent = 'Streaming conectado.'; };
  runEventSource.onerror = () => { feedback.textContent = 'Streaming interrompido; verifique o run.'; };
  for (const type of ['agent.notification', 'agent.thread.started', 'agent.turn.completed', 'application.prepared', 'application.submission_confirmed', 'run.needs_reconcile', 'run.paused', 'run.resumed']) runEventSource.addEventListener(type, (event) => { output.textContent += `${event.type}: ${event.data}\n`; });
}

function renderCompact(selector, items, toText) {
  const container = document.querySelector(selector);
  if (!items.length) { container.textContent = 'Nenhum registro.'; return; }
  container.replaceChildren(...items.slice(0, 6).map((item) => { const row = document.createElement('div'); row.textContent = toText(item); return row; }));
}

async function runResumeOperation(event, operation) {
  event?.preventDefault();
  const formData = Object.fromEntries(new FormData(resumeTools));
  const feedback = document.querySelector('#resume-feedback'); feedback.textContent = 'Processando…';
  const endpoint = operation === 'select' ? '/api/v1/resumes/select' : operation === 'extract' ? '/api/v1/resumes/extract' : '/api/v1/jobs/fit';
  const requestBody = operation === 'extract' ? { path: formData.sourcePath } : formData;
  const response = await fetch(endpoint, { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(requestBody) });
  if (!response.ok) { feedback.textContent = 'Não foi possível concluir.'; return; }
  const result = await response.json();
  feedback.textContent = operation === 'select' ? `Resultado: ${result.output ?? 'currículo selecionado'}` : operation === 'extract' ? `Extraído: ${result.path ?? 'ok'}` : `Aderência: ${result.score ?? 0}% · classe ${result.classification ?? '—'}`;
}

function renderOnboarding(state, profile) {
  const section = document.querySelector('#onboarding-section');
  const configured = profile?.profile?.exists === true && state.campaign.platforms.length > 0;
  section.hidden = configured;
}

async function saveOnboarding(event) {
  event.preventDefault();
  const feedback = document.querySelector('#onboarding-feedback');
  const data = Object.fromEntries(new FormData(onboardingForm));
  data.campaign = {
    totalGoal: Number(data.totalGoal), dailyGoal: Number(data.dailyGoal), weeklyGoal: Number(data.weeklyGoal),
    periodStart: data.periodStart, periodEnd: data.periodEnd, exclusions: splitValues(data.exclusions), filters: { roles: splitValues(data.rolesFilter), seniority: splitValues(data.seniorityFilter) },
    platforms: String(data.platforms).split(',').map((name) => name.trim()).filter(Boolean).map((name) => ({ name, enabled: true, goal: 0 }))
  };
  delete data.totalGoal; delete data.dailyGoal; delete data.weeklyGoal; delete data.platforms; delete data.periodStart; delete data.periodEnd; delete data.exclusions; delete data.rolesFilter; delete data.seniorityFilter;
  feedback.textContent = 'Salvando…';
  const response = await fetch('/api/v1/onboarding', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(data) });
  feedback.textContent = response.ok ? 'Configuração salva localmente.' : 'Não foi possível salvar. Revise os campos.';
  if (response.ok) { if (submissionApproval?.id === id) submissionApproval.status = decision; await loadState(); }
}

function splitValues(value) { return String(value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean); }

function renderApprovals(approvals) {
  const container = document.querySelector('#approval-list');
  if (!approvals.length) {
    container.textContent = 'Nenhuma aprovação pendente.';
    container.className = 'approval-list empty-state';
    return;
  }
  container.className = 'approval-list';
  container.replaceChildren(...approvals.map((approval) => {
    const row = document.createElement('article');
    row.className = 'approval-row';
    row.innerHTML = `<div><strong>${escapeHtml(approval.kind)}</strong><small>${escapeHtml(approval.status)} · expira ${escapeHtml(approval.expiresAt)} · run ${escapeHtml(approval.runId)}</small><details class="approval-details"><summary>Ver detalhes da ação</summary><pre>${escapeHtml(JSON.stringify(approval.payloadSummary ?? {}, null, 2))}</pre></details></div><div class="approval-actions"></div>`;
    const actions = row.querySelector('.approval-actions');
    if (approval.status === 'pending') {
      for (const decision of ['approved', 'rejected']) {
        const button = document.createElement('button');
        button.className = decision === 'approved' ? 'approval-button primary' : 'approval-button';
        button.type = 'button';
        button.textContent = decision === 'approved' ? 'Aprovar' : 'Rejeitar';
        button.addEventListener('click', () => decideApproval(approval.id, decision));
        actions.append(button);
      }
    }
    return row;
  }));
}

async function decideApproval(id, decision) {
  const response = await fetch(`/api/v1/approvals/${encodeURIComponent(id)}/decision`, {
    method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ decision, actorId: 'local-user' })
  });
  if (response.ok) await loadState();
}

async function runPreflight() {
  preflightButton.disabled = true;
  preflightButton.textContent = 'Executando…';
  try {
    await fetch('/api/v1/preflight/run', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: '{}' });
    await loadState();
  } finally {
    preflightButton.disabled = false;
    preflightButton.textContent = 'Executar preflight';
  }
}

function renderMetrics(state) {
  const metrics = [
    ['confirmadas', state.applications.confirmedCount ?? 0],
    ['meta total', state.campaign.totalGoal ?? 0],
    ['na fila', state.queue.counts?.['na fila'] ?? 0],
    ['em andamento', state.queue.counts?.['em andamento'] ?? 0]
  ];
  const container = document.querySelector('#campaign-metrics');
  container.replaceChildren(...metrics.map(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'metric';
    item.innerHTML = `<strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span>`;
    return item;
  }));
}

function renderPlatforms(platforms, registry = []) {
  const container = document.querySelector('#campaign-platforms');
  if (!platforms.length) {
    container.textContent = 'Nenhuma plataforma configurada.';
    container.className = 'platform-list empty-state';
    return;
  }
  container.className = 'platform-list';
  container.replaceChildren(...platforms.map((platform) => {
    const definition = registry.find((item) => item.name === platform.name) ?? {};
    const item = document.createElement('div');
    item.className = 'platform-row';
    item.innerHTML = `<strong>${escapeHtml(platform.name || '—')}</strong><span>${escapeHtml(`${platform.enabled ? 'habilitada' : 'desabilitada'} · ${definition.auth || 'manual'} · ${definition.urlEnv || 'URL local'}`)}</span><b>${escapeHtml(platform.goal ?? 0)}</b><small>${escapeHtml(definition.playbook || '')}</small>`;
    return item;
  }));
}

function renderQueue(queue) {
  document.querySelector('#queue-count').textContent = `${queue.items.length} ${queue.items.length === 1 ? 'vaga' : 'vagas'}`;
  const container = document.querySelector('#queue-list');
  if (!queue.items.length) {
    container.className = 'data-list empty-state';
    container.textContent = 'Nenhum registro local.';
    return;
  }
  container.className = 'data-list';
  container.replaceChildren(...queue.items.slice(0, 8).map((item) => {
    const row = document.createElement('article');
    row.className = 'data-row';
    row.innerHTML = `<span class="row-mark">${escapeHtml(item.priority || '—')}</span><div class="row-main"><strong>${escapeHtml(item.role || 'Vaga sem cargo')}</strong><small>${escapeHtml(`${item.company || 'Empresa não informada'} · ${item.platform || 'plataforma não informada'}`)}</small></div><div class="row-meta"><strong>${escapeHtml(item.status || 'sem status')}</strong><small>${escapeHtml(item.fitScore != null ? `${item.fitScore}% aderência` : 'aderência não calculada')}</small></div>`;
    if (item.status === 'na fila' && item.id) {
      const button = document.createElement('button');
      button.className = 'row-action';
      button.type = 'button';
      button.textContent = 'Reivindicar';
      button.addEventListener('click', () => claimQueueItem(item.id));
      row.append(button);
    }
    return row;
  }));
}

async function claimQueueItem(id) {
  const response = await fetch(`/api/v1/queue/${encodeURIComponent(id)}/claim`, { method: 'POST', headers: mutationHeaders() });
  if (response.ok) await loadState();
}

async function exportShareable() {
  exportButton.disabled = true;
  exportButton.textContent = 'Exportando…';
  try {
    const response = await fetch('/api/v1/exports/shareable', { method: 'POST', headers: mutationHeaders() });
    document.querySelector('#footer-version').textContent = response.ok ? 'pacote criado em dist/' : 'falha na exportação';
  } finally {
    exportButton.disabled = false;
    exportButton.textContent = 'Exportar pacote';
  }
}

function renderApplications(applications) {
  document.querySelector('#application-count').textContent = `${applications.items.length} ${applications.items.length === 1 ? 'registro' : 'registros'}`;
  renderList('#applications-list', applications.items, (item) => [statusMark(item.status), item.role || 'Vaga sem cargo', `${item.company || 'Empresa não informada'} · ${item.platform || 'plataforma não informada'}`, item.status || 'sem status', item.nextAction || 'sem próxima ação']);
}

function renderList(selector, items, toRow) {
  const container = document.querySelector(selector);
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhum registro local.';
    container.replaceChildren(empty);
    return;
  }
  container.replaceChildren(...items.slice(0, 8).map((item) => {
    const [mark, title, detail, status, meta] = toRow(item);
    const row = document.createElement('article');
    row.className = 'data-row';
    row.innerHTML = `<span class="row-mark">${escapeHtml(mark)}</span><div class="row-main"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div><div class="row-meta"><strong>${escapeHtml(status)}</strong><small>${escapeHtml(meta)}</small></div>`;
    return row;
  }));
}

function renderCheckpoint(checkpoint) {
  const container = document.querySelector('#checkpoint-content');
  if (!checkpoint) {
    container.textContent = 'Nenhum checkpoint salvo.';
    container.className = 'checkpoint-content empty-state';
    return;
  }
  container.className = 'checkpoint-content';
  container.replaceChildren(...[
    ['fase', checkpoint.phase],
    ['plataforma', checkpoint.platform],
    ['chave', checkpoint.applicationKey],
    ['observação', checkpoint.notes]
  ].filter(([, value]) => value).map(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'checkpoint-item';
    item.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
    return item;
  }));
}

function statusMark(status) {
  return status === 'enviada' || status === 'triagem' ? '✓' : status === 'rejeitada' ? '×' : '·';
}

function renderUnavailable() {
  document.querySelector('#installation-status').textContent = 'Estado indisponível';
  document.querySelector('#preflight-summary').textContent = 'Não foi possível ler os arquivos locais.';
  document.querySelector('#freshness').textContent = 'Falha na leitura';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}
