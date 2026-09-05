import { mountPersistence } from './persistence.js';
import { summarizePreflight } from './preflight-summary.js';
import { openOAuthWindow } from './oauth-window.js';
import { mountAutopilotDecisions } from './autopilot-decisions.js';

const refreshButton = document.querySelector('#refresh');
const openaiAuthButton = document.querySelector('#openai-auth-button');
const openaiAuthStatus = document.querySelector('#openai-auth-status');
const nextActionButton = document.querySelector('#next-action-button');
const autopilotStartButton = document.querySelector('#autopilot-start');
const screenBackButton = document.querySelector('#screen-back');
const preflightButton = document.querySelector('#run-preflight');
const exportButton = document.querySelector('#export-shareable');
const onboardingForm = document.querySelector('#onboarding-form');
const resumeTools = document.querySelector('#resume-tools');
const connectStreamButton = document.querySelector('#connect-run-stream');
const queueSearchForm = document.querySelector('#queue-search');
const queueAddForm = document.querySelector('#queue-add');
const followUpForm = document.querySelector('#follow-up-form');
const followUpCheckButton = document.querySelector('#follow-up-check');
const legacyImportForm = document.querySelector('#legacy-import-form');
const assessmentPrepForm = document.querySelector('#assessment-prep-form');
const assessmentResultForm = document.querySelector('#assessment-result-form');
const assessmentPauseButton = document.querySelector('#assessment-pause');
const applicationTools = document.querySelector('#application-tools');
const codexSettingsForm = document.querySelector('#codex-settings-form');
const codexModelSelect = document.querySelector('#codex-model');
const codexEffortSelect = document.querySelector('#codex-effort');
const codexRefreshButton = document.querySelector('#codex-refresh');
const autopilotPauseButton = document.querySelector('#autopilot-pause');
const autopilotResumeButton = document.querySelector('#autopilot-resume-run');
const autopilotChangeGoalButton = document.querySelector('#autopilot-change-goal');
const autopilotEvidenceButton = document.querySelector('#autopilot-evidence');
let preparedApplication;
let submissionApproval;
let submissionPayload;
let assessmentTimer;
let assessmentRemaining = 0;
let csrfToken = '';
let runEventSource;
let onboardingStep = 0;
let onboardingPanels = [];
let pendingQueueItemId = '';
let nextActionHandler = () => document.querySelector('#onboarding-section').scrollIntoView({ behavior: 'smooth' });

setupOnboardingWizard();
nextActionButton.addEventListener('click', () => nextActionHandler());
autopilotStartButton.addEventListener('click', startAutopilot);
document.querySelector('#autopilot-intent').addEventListener('input', (event) => { try { localStorage.setItem('fluxo-autopilot-intent', event.target.value); } catch {} });
document.querySelector('#autopilot-resume').addEventListener('change', (event) => { if (event.target.files?.[0]) showToast('Currículo anexado ao contexto do Autopilot.', 'info'); });
try { document.querySelector('#autopilot-intent').value = localStorage.getItem('fluxo-autopilot-intent') ?? ''; } catch {}
screenBackButton.addEventListener('click', () => goTo(previousRoute || 'home'));
refreshButton.addEventListener('click', loadState);
openaiAuthButton.addEventListener('click', startOpenAIAuth);
preflightButton.addEventListener('click', runPreflight);
exportButton.addEventListener('click', exportShareable);
onboardingForm.addEventListener('submit', saveOnboarding);
resumeTools.addEventListener('submit', (event) => runResumeOperation(event, 'fit'));
resumeTools.querySelector('[data-operation="select"]').addEventListener('click', () => runResumeOperation(null, 'select'));
resumeTools.querySelector('[data-operation="extract"]').addEventListener('click', () => runResumeOperation(null, 'extract'));
document.querySelector('#resume-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = await importResumeFile(file);
    document.querySelector('#resume-source-path').value = imported.path;
    showToast(imported.extraction?.ok === false ? imported.extraction.pending : 'Currículo importado e verificado.', imported.extraction?.ok === false ? 'error' : 'success');
  } catch (error) { showToast(error.message ?? 'Não foi possível importar o currículo.', 'error'); }
});
connectStreamButton.addEventListener('click', connectRunStream);
queueSearchForm.addEventListener('submit', searchQueue);
queueSearchForm.addEventListener('input', debounce(searchQueue, 250));
document.querySelector('#queue-clear-filter').addEventListener('click', clearQueueFilter);
queueAddForm.querySelector('[name="identifierOrUrl"]').addEventListener('blur', (event) => {
  const platform = inferPlatformFromUrl(event.target.value);
  const selector = queueAddForm.querySelector('[name="platform"]');
  if (platform && !selector.value) { selector.value = platform; showToast(`Plataforma identificada: ${platform}.`, 'info'); }
});
queueAddForm.addEventListener('submit', addQueueItem);
followUpForm.addEventListener('submit', recordFollowUp);
followUpCheckButton.addEventListener('click', checkFollowUp);
legacyImportForm.addEventListener('submit', importLegacy);
assessmentPrepForm.addEventListener('submit', prepareAssessment);
assessmentResultForm.addEventListener('submit', recordAssessment);
assessmentPauseButton.addEventListener('click', toggleAssessmentTimer);
applicationTools.querySelector('[data-application-action="prepare"]').addEventListener('click', prepareApplication);
applicationTools.querySelector('[data-application-action="approve"]').addEventListener('click', requestApplicationApproval);
applicationTools.querySelector('[data-application-action="submit"]').addEventListener('click', submitApplication);
codexSettingsForm.addEventListener('submit', saveCodexSettings);
codexModelSelect.addEventListener('change', () => updateCodexEfforts(codexModelSelect.value));
codexRefreshButton.addEventListener('click', refreshCodex);
autopilotPauseButton.addEventListener('click', () => updateAutopilotRun('interrupt'));
autopilotResumeButton.addEventListener('click', () => updateAutopilotRun('resume'));
autopilotChangeGoalButton.addEventListener('click', () => { document.querySelector('#autopilot-intent').focus(); showToast('Atualize o objetivo e inicie uma nova jornada.', 'info'); });
autopilotEvidenceButton.addEventListener('click', exportAutopilotEvidence);
bootstrapSession().finally(loadState);

async function bootstrapSession() {
  const response = await fetch('/api/v1/auth/session', { cache: 'no-store' });
  if (response.ok) csrfToken = (await response.json()).csrfToken ?? '';
}

function mutationHeaders(extra = {}) { return { ...extra, ...(csrfToken ? { 'x-fluxo-csrf': csrfToken } : {}) }; }

let activeRoute = '';
let previousRoute = '';
const routeLabels = { home: 'Início', setup: 'Configuração', queue: 'Fila', applications: 'Candidaturas', operations: 'Operações', followup: 'Acompanhamento' };
const routeMeta = {
  home: { kicker: 'autopilot', title: 'Autopilot do Fluxo', description: 'Defina o objetivo. A IA conduz a jornada e mostra apenas o que precisa da sua atenção.' },
  setup: { kicker: 'primeiro uso', title: 'Configurar seu Fluxo', description: 'Defina seu perfil e campanha uma vez. O rascunho fica salvo neste computador.' },
  queue: { kicker: 'prioridade', title: 'Fila de vagas', description: 'Encontre, compare e prepare a próxima oportunidade sem perder o contexto.' },
  applications: { kicker: 'execução segura', title: 'Candidaturas', description: 'Revise cada ação, acompanhe o run e aprove somente o que estiver correto.' },
  operations: { kicker: 'qualificação', title: 'Ferramentas da operação', description: 'Trabalhe currículo, aderência e questionários em um espaço dedicado.' },
  followup: { kicker: 'continuidade', title: 'Acompanhamento', description: 'Registre entrevistas, mensagens, testes e a próxima ação de cada candidatura.' }
};

function setupRouter() { window.addEventListener('hashchange', renderRoute); renderRoute(); }
function renderRoute() {
  const requested = window.location.hash.slice(1).toLowerCase();
  const route = routeLabels[requested] ? requested : 'home';
  const changed = activeRoute && activeRoute !== route;
  if (changed) previousRoute = activeRoute;
  activeRoute = route;
  document.querySelector('#app-main').dataset.route = route;
  const meta = routeMeta[route]; document.querySelector('#screen-kicker').textContent = meta.kicker; document.querySelector('#screen-title').textContent = meta.title; document.querySelector('#screen-description').textContent = meta.description; screenBackButton.hidden = route === 'home';
  document.querySelectorAll('[data-view]').forEach((view) => { view.hidden = view.dataset.view !== route; });
  document.querySelectorAll('#primary-nav a').forEach((link) => { link.setAttribute('aria-current', link.getAttribute('href') === `#${route}` ? 'page' : 'false'); });
  const breadcrumb = document.querySelector('.breadcrumbs span:last-child'); if (breadcrumb) breadcrumb.textContent = routeLabels[route];
  if (changed) window.scrollTo({ top: 0, behavior: 'smooth' });
}
function goTo(route) { window.location.hash = route; }
setupRouter();

function setupOnboardingWizard() {
  const form = onboardingForm;
  const sourceGrid = form.querySelector(':scope > .form-grid');
  if (!sourceGrid) return;
  const labels = [...sourceGrid.querySelectorAll(':scope > label')];
  const directLabels = [...form.children].filter((element) => element.tagName === 'LABEL');
  const byName = new Map([...labels, ...directLabels].map((label) => [label.querySelector('[name]')?.name, label]).filter(([name]) => name));
  sourceGrid.remove();
  const definitions = [
    ['identity', 'Sobre você', ['name', 'email', 'phone', 'location']],
    ['objective', 'Seu objetivo profissional', ['targetRoles', 'seniority', 'technicalFocus', 'professionalSummary', 'strengths']],
    ['preferences', 'Onde e como você quer trabalhar', ['workModes', 'acceptedLocations', 'contracts', 'minimumSalary', 'availability', 'education', 'languages', 'workAuthorization', 'travel', 'pcd']],
    ['campaign', 'Como devemos buscar', []],
    ['review', 'Confira sua configuração', []]
  ];
  onboardingPanels = definitions.map(([key, title, names]) => {
    const panel = document.createElement('fieldset'); panel.id = `wizard-step-${key}`; panel.className = 'wizard-panel';
    const legend = document.createElement('legend'); legend.textContent = title; panel.append(legend);
    if (key !== 'review') { const fields = document.createElement('div'); fields.className = 'form-grid'; for (const name of names) if (byName.has(name)) fields.append(byName.get(name)); panel.append(fields); }
    form.querySelector('#onboarding-progress').after(panel);
    return panel;
  });
  const campaignPanel = onboardingPanels[3];
  const campaignFieldset = form.querySelector('#onboarding-campaign');
  if (campaignFieldset) campaignPanel.append(campaignFieldset);
  const review = form.querySelector('#onboarding-review') ?? document.createElement('div'); review.id = 'onboarding-review'; review.className = 'review-summary'; review.removeAttribute('hidden'); onboardingPanels[4].append(review);
  const actions = form.querySelector('.form-actions');
  const back = document.createElement('button'); back.id = 'onboarding-back'; back.className = 'secondary-button'; back.type = 'button'; back.textContent = 'Voltar'; back.addEventListener('click', () => showOnboardingStep(onboardingStep - 1));
  const next = document.createElement('button'); next.id = 'onboarding-next'; next.className = 'primary-button'; next.type = 'button'; next.textContent = 'Continuar'; next.addEventListener('click', () => advanceOnboarding());
  actions.prepend(back, next);
  document.querySelector('#onboarding-clear-draft').addEventListener('click', clearOnboardingDraft);
  form.addEventListener('input', () => { saveOnboardingDraft(); updateOnboardingReview(); });
  restoreOnboardingDraft(); updateOnboardingReview(); showOnboardingStep(Number(localStorage.getItem('fluxo-onboarding-step') ?? 0));
}

function showOnboardingStep(index) {
  onboardingStep = Math.max(0, Math.min(index, onboardingPanels.length - 1));
  try { localStorage.setItem('fluxo-onboarding-step', String(onboardingStep)); } catch {}
  onboardingPanels.forEach((panel, position) => { panel.hidden = position !== onboardingStep; });
  document.querySelector('#onboarding-back').hidden = onboardingStep === 0;
  document.querySelector('#onboarding-next').hidden = onboardingStep === onboardingPanels.length - 1;
  const save = onboardingForm.querySelector('.primary-button[type="submit"]'); if (save) save.hidden = onboardingStep !== onboardingPanels.length - 1;
  document.querySelectorAll('#onboarding-progress > span').forEach((item, position) => { item.classList.toggle('is-current', position === onboardingStep || position === onboardingPanels.length - 1 && onboardingStep === onboardingPanels.length - 1); item.setAttribute('aria-current', position === onboardingStep ? 'step' : 'false'); });
  updateOnboardingReview();
}

function advanceOnboarding() {
  const panel = onboardingPanels[onboardingStep];
  const invalid = [...panel.querySelectorAll('input, textarea, select')].filter((field) => !field.checkValidity());
  if (panel.id === 'wizard-step-campaign' && !panel.querySelector('input[name="platforms"]:checked')) invalid.push(panel.querySelector('input[name="platforms"]'));
  if (invalid.length) { showOnboardingErrors(invalid); return; }
  hideOnboardingErrors(); showOnboardingStep(onboardingStep + 1);
}

function showOnboardingErrors(fields, message = '') {
  const summary = document.querySelector('#onboarding-error-summary'); summary.hidden = false; summary.textContent = message || `Revise ${fields.length} campo${fields.length > 1 ? 's' : ''} nesta etapa.`; (fields[0] ?? summary).focus();
}
function hideOnboardingErrors() { document.querySelector('#onboarding-error-summary').hidden = true; }
function clearOnboardingDraft() { if (!window.confirm('Limpar o rascunho desta configuração?')) return; onboardingForm.reset(); onboardingForm.querySelector('input[name="platforms"][value="GUPY"]').checked = true; localStorage.removeItem('fluxo-onboarding-draft'); localStorage.removeItem('fluxo-onboarding-step'); showOnboardingStep(0); updateOnboardingReview(); showToast('Rascunho limpo.'); }
function saveOnboardingDraft() { try { const draft = {}; for (const field of onboardingForm.elements) { if (!field.name || field.disabled) continue; if (field.type === 'checkbox') { if (!draft[field.name]) draft[field.name] = []; if (field.checked) draft[field.name].push(field.value); } else if (field.type !== 'file') draft[field.name] = field.value; } localStorage.setItem('fluxo-onboarding-draft', JSON.stringify(draft)); } catch {} }
function restoreOnboardingDraft() { try { const draft = JSON.parse(localStorage.getItem('fluxo-onboarding-draft') ?? '{}'); for (const field of onboardingForm.elements) { if (!field.name || field.type === 'file') continue; const value = draft[field.name]; if (field.type === 'checkbox') field.checked = Array.isArray(value) && value.includes(field.value); else if (value != null) field.value = value; } } catch {} }
function updateOnboardingReview() { const review = document.querySelector('#onboarding-review'); if (!review) return; const formData = new FormData(onboardingForm); const data = Object.fromEntries(formData); data.platforms = formData.getAll('platforms').join(', '); review.replaceChildren(...[['Nome', data.name], ['Cargo-alvo', data.targetRoles], ['Modalidade', data.workModes], ['Plataformas', data.platforms], ['Meta total', data.totalGoal]].filter(([, value]) => value).map(([label, value]) => { const item = document.createElement('div'); item.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`; return item; })); }

async function loadState() {
  refreshButton.disabled = true;
  refreshButton.classList.add('is-loading');
  setScreenState('loading', 'Carregando dados locais…');
  try {
    if (new URLSearchParams(window.location.search).get('fixture') === 'demo') {
      const fixtureResponse = await fetch('/fixtures/ui-state.json', { cache: 'no-store' });
      if (!fixtureResponse.ok) throw new Error('fixture_read_failed');
      const fixture = await fixtureResponse.json();
      document.querySelector('#fixture-banner').hidden = false;
      render(fixture.state, fixture.approvals, fixture.profile, fixture.metrics, fixture.pending, fixture.assessments, fixture.platforms, fixture.memory, fixture.exceptions, fixture.codex);
      renderAutopilot(fixture.autopilot);
      renderOpenAIAuth({ status: 'fixture', authenticated: false, message: 'Modo demonstração local' });
      setScreenState('ready', 'Demonstração local');
      return;
    }
    const [response, approvalsResponse, profileResponse, metricsResponse, pendingResponse, assessmentsResponse, platformsResponse, memoryResponse, exceptionsResponse] = await Promise.all([
      fetch('/api/v1/state', { cache: 'no-store' }),
      fetch('/api/v1/approvals', { cache: 'no-store' }),
      fetch('/api/v1/profile', { cache: 'no-store' }),
      fetch('/api/v1/metrics', { cache: 'no-store' }),
      fetch('/api/v1/pending', { cache: 'no-store' }),
      fetch('/api/v1/assessments', { cache: 'no-store' }),
      fetch('/api/v1/platforms', { cache: 'no-store' })
      , fetch('/api/v1/memory', { cache: 'no-store' }), fetch('/api/v1/exceptions?status=open', { cache: 'no-store' })
    ]);
    if (!response.ok) throw new Error('state_read_failed');
    render(await response.json(), approvalsResponse.ok ? await approvalsResponse.json() : [], profileResponse.ok ? await profileResponse.json() : null,
      metricsResponse.ok ? await metricsResponse.json() : null, pendingResponse.ok ? await pendingResponse.json() : [], assessmentsResponse.ok ? await assessmentsResponse.json() : [], platformsResponse.ok ? await platformsResponse.json() : [], memoryResponse.ok ? await memoryResponse.json() : null, exceptionsResponse.ok ? await exceptionsResponse.json() : []);
    setScreenState('ready', 'Dados locais atualizados');
    // Os painéis que dependem do runtime de IA não podem atrasar a leitura local.
    refreshRuntimePanels();
  } catch (error) {
    setScreenState('error', `Não foi possível ler os dados locais: ${error?.message ?? 'motivo desconhecido'}`);
    renderUnavailable();
  } finally {
    refreshButton.disabled = false;
    refreshButton.classList.remove('is-loading');
  }
}

async function refreshRuntimePanels() {
  renderOpenAIAuth(await readJsonOrNull('/api/v1/auth/openai') ?? { status: 'unavailable', message: 'Login do ChatGPT indisponível.' });
  renderCodexControlCenter(await readJsonOrNull('/api/v1/codex') ?? { status: 'unavailable', error: { message: 'Codex indisponível.' } });
}

async function readJsonOrNull(url) {
  try { const response = await fetch(url, { cache: 'no-store' }); return response.ok ? await response.json() : null; } catch { return null; }
}

function setScreenState(state, message) { const main = document.querySelector('#app-main'); main.dataset.screenState = state; const indicator = document.querySelector('#screen-state'); if (indicator) { indicator.textContent = message; indicator.dataset.state = state; } }
function renderOpenAIAuth(auth = {}) { if (!openaiAuthStatus) return; openaiAuthStatus.textContent = auth.authenticated ? `ChatGPT conectado${auth.email ? ` · ${auth.email}` : ''}` : auth.message ?? 'ChatGPT não conectado'; openaiAuthStatus.dataset.state = auth.authenticated ? 'ready' : auth.status === 'error' ? 'error' : 'attention'; openaiAuthButton.textContent = auth.authenticated ? 'Reconectar ChatGPT' : 'Entrar com ChatGPT'; }
async function startOpenAIAuth() { return withBusyButton(openaiAuthButton, 'Abrindo login…', async () => { const response = await fetch('/api/v1/auth/openai/login', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({}) }); if (response.ok) { const auth = await response.json(); renderOpenAIAuth(auth); if (auth.authUrl) openOAuthWindow(auth.authUrl); if (auth.userCode) showToast(`Código de dispositivo: ${auth.userCode}`, 'info'); else showToast('Conclua o login do ChatGPT no navegador.', 'info'); window.setTimeout(refreshOpenAIAuth, 3000); } else showToast('Não foi possível iniciar o login do ChatGPT.', 'error'); }); }
async function refreshOpenAIAuth() { try { const response = await fetch('/api/v1/auth/openai', { cache: 'no-store' }); if (response.ok) renderOpenAIAuth(await response.json()); } catch {} }
function renderCodexControlCenter(data = {}) { const account = document.querySelector('#codex-account'); const usage = document.querySelector('#codex-usage'); const limits = document.querySelector('#codex-limits'); if (!account) return; if (data.status !== 'ready') { const message = data.error?.message ?? 'Codex app-server indisponível.'; account.textContent = message; usage.textContent = 'Uso indisponível'; limits.textContent = 'Limites indisponíveis'; return; } account.textContent = `Conta: ${data.account?.email ?? 'ChatGPT'} · plano ${data.account?.planType ?? 'não informado'}`; usage.textContent = `Uso acumulado: ${formatNumber(data.usage?.summary?.lifetimeTokens ?? 0)} tokens`; const primary = data.rateLimits?.primary; const secondary = data.rateLimits?.secondary; limits.textContent = `Janela curta: ${primary?.usedPercent ?? 0}% usado · semanal: ${secondary?.usedPercent ?? 0}% usado${primary?.resetsAt ? ` · reset ${formatEpoch(primary.resetsAt)}` : ''}`; codexModelSelect.replaceChildren(...(data.models ?? []).map((model) => { const option = document.createElement('option'); option.value = model.id; option.textContent = model.displayName || model.id; option.dataset.efforts = JSON.stringify(model.efforts ?? []); return option; })); const selected = data.settings?.model && [...codexModelSelect.options].some((option) => option.value === data.settings.model) ? data.settings.model : codexModelSelect.options[0]?.value ?? ''; codexModelSelect.value = selected; updateCodexEfforts(selected, data.settings?.effort); for (const field of ['verbosity', 'reasoningSummary']) if (data.settings?.[field] && codexSettingsForm.elements[field]) codexSettingsForm.elements[field].value = data.settings[field]; }
function updateCodexEfforts(modelId, selected = '') { const option = [...codexModelSelect.options].find((item) => item.value === modelId); const efforts = option ? JSON.parse(option.dataset.efforts || '[]') : []; codexEffortSelect.replaceChildren(...(efforts.length ? efforts : ['low', 'medium', 'high']).map((effort) => { const item = document.createElement('option'); item.value = effort; item.textContent = effort; return item; })); if (selected && efforts.includes(selected)) codexEffortSelect.value = selected; else if (efforts.includes('medium')) codexEffortSelect.value = 'medium'; }
async function refreshCodex() { return withBusyButton(codexRefreshButton, 'Atualizando…', async () => { const response = await fetch('/api/v1/codex/refresh', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: '{}' }); if (response.ok) { const data = await response.json(); renderCodexControlCenter(data.data ?? data); showToast('Dados do Codex atualizados.', 'success'); } else showToast('Não foi possível atualizar o Codex.', 'error'); }); }
async function saveCodexSettings(event) { event.preventDefault(); const response = await fetch('/api/v1/codex/settings', { method: 'PUT', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(Object.fromEntries(new FormData(codexSettingsForm))) }); const feedback = document.querySelector('#codex-settings-feedback'); if (response.ok) { const result = await response.json(); feedback.textContent = `Salvo: ${result.data?.model ?? result.model} · effort ${result.data?.effort ?? result.effort}`; showToast('Configuração do Codex salva.', 'success'); } else { let message = 'Configuração rejeitada.'; try { message = (await response.json()).error?.message ?? message; } catch {} feedback.textContent = message; showToast(message, 'error'); } }
function formatNumber(value) { return Number(value || 0).toLocaleString('pt-BR'); }
function formatEpoch(value) { try { return new Date(Number(value) * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return 'não informado'; } }

async function startAutopilot() {
  const button = autopilotStartButton;
  return withBusyButton(button, 'Iniciando…', async () => {
    const status = document.querySelector('#autopilot-status');
    const intent = document.querySelector('#autopilot-intent').value.trim() || (onboardingForm.elements.targetRoles?.value ?? '');
    const targetRoles = onboardingForm.elements.targetRoles?.value ?? '';
    const resumeFile = document.querySelector('#autopilot-resume').files?.[0];
    let resumePath = '';
    let importedResume = null;
    const platforms = [...onboardingForm.querySelectorAll('input[name="platforms"]:checked')].map((field) => field.value);
    try {
      // Uma importação recusada precisa aparecer: sem isso o Autopilot parecia nunca ter começado.
      if (resumeFile) {
        importedResume = await importResumeFile(resumeFile);
        resumePath = importedResume.path;
      }
      if (new URLSearchParams(window.location.search).get('fixture') === 'demo') { renderAutopilot({ status: 'running', message: 'Demonstração: a IA está conduzindo a jornada.', plan: [...document.querySelectorAll('#autopilot-plan li')].map((item, index) => ({ id: item.textContent, label: item.textContent.slice(2), status: index === 0 ? 'succeeded' : index === 1 ? 'running' : 'pending' })) }); return; }
      const response = await fetch('/api/v1/autopilot/start', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ intent, targetRoles, resumePath, platforms, importedResume }) });
      if (!response.ok) { status.textContent = 'Não foi possível iniciar. Revise o ambiente local.'; showToast('O Autopilot não pôde iniciar.', 'error'); return; }
      const result = await response.json();
      const data = result.data ?? result;
      renderAutopilot(data);
      if (data.run?.id) { localStorage.setItem('fluxo-autopilot-run', data.run.id); document.querySelector('#run-stream-id').value = data.run.id; connectRunStream(); }
      showToast('Autopilot iniciado. A IA está conduzindo a jornada.', 'success');
    } catch (error) { status.textContent = error?.message || 'Conexão local indisponível. Tente novamente.'; showToast('Não foi possível iniciar o Autopilot.', 'error'); }
  });
}

const autopilotDecisions = mountAutopilotDecisions({ mutationHeaders, onContinued: (result) => { renderAutopilot(result); loadState(); } });

function renderAutopilot(result = {}) {
  const status = document.querySelector('#autopilot-status');
  const exception = document.querySelector('#autopilot-exception');
  autopilotDecisions.update(result);
  status.textContent = result.message ?? (result.status === 'running' ? 'A IA está trabalhando…' : 'Pronto para começar');
  exception.hidden = !['needs_attention', 'blocked', 'exception'].includes(result.status);
  if (!exception.hidden) exception.textContent = result.exception ?? 'A IA precisa de uma informação para continuar.';
  renderAutopilotTimeline(result.timeline ?? [{ status: result.status ?? 'pending', message: result.message ?? 'Pronto para entender seu objetivo.' }]);
  if (result.memory) renderAutopilotMemory(result.memory);
  if (result.results) renderAutopilotResults(result.results);
  const plan = document.querySelector('#autopilot-plan');
  const steps = Array.isArray(result.plan) && result.plan.length ? result.plan : [];
  if (!steps.length) return;
  plan.replaceChildren(...steps.map((step, index) => { const item = document.createElement('li'); item.dataset.status = step.status ?? 'pending'; const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0'); item.append(number, document.createTextNode(step.label ?? step.id ?? 'Etapa')); return item; }));
}

function renderAutopilotTimeline(entries) { const timeline = document.querySelector('#autopilot-timeline'); timeline.replaceChildren(...entries.slice(-6).map((entry) => { const item = document.createElement('li'); item.dataset.status = entry.status ?? 'pending'; item.textContent = entry.message ?? 'Atualização do Autopilot.'; return item; })); }

function renderAutopilotMemory(memory = {}) { const container = document.querySelector('#autopilot-memory'); if (!container) return; const facts = memory.facts ?? {}; const entries = Object.entries(facts).slice(0, 8).map(([key, fact]) => [humanize(key), formatValue(fact?.value ?? fact)]); const resume = memory.selectedResume?.path ? `Currículo: ${memory.selectedResume.path}` : 'Currículo: ainda não selecionado'; container.replaceChildren(document.createElement('p'), ...entries.map(([label, value]) => { const item = document.createElement('span'); item.textContent = `${label}: ${value}`; return item; })); container.querySelector('p').textContent = `${resume} · ${memory.lastExecution?.status ?? 'sem execução anterior'}`; }
function renderAutopilotResults(results = {}) { const container = document.querySelector('#autopilot-results'); if (!container) return; const items = Array.isArray(results) ? results : results.items ?? results.opportunities ?? []; if (!items.length) { container.querySelector('div').textContent = 'Nenhuma oportunidade elegível ainda.'; return; } container.replaceChildren(document.createElement('p'), ...items.slice(0, 5).map((item) => { const row = document.createElement('div'); const fit = item.fit ?? item; row.textContent = `${item.role ?? 'Oportunidade'} · ${item.company ?? ''} · ${fit.classification ?? 'aderência'}${fit.score != null ? ` · ${fit.score}%` : ''}`; return row; })); container.querySelector('p').textContent = 'A IA encontrou estas oportunidades para sua decisão:'; }
function renderAutopilotExceptions(items = []) { const container = document.querySelector('#autopilot-exceptions'); if (!container) return; if (!items.length) { container.querySelector('div').textContent = 'Nenhuma exceção aberta.'; return; } container.replaceChildren(document.createElement('p'), ...items.slice(0, 5).map((exception) => { const row = document.createElement('div'); row.textContent = `${exception.message} · ${exception.nextAction}`; return row; })); container.querySelector('p').textContent = 'A IA pausou apenas o que precisa de contexto:'; }
async function updateAutopilotRun(action) { const runId = localStorage.getItem('fluxo-autopilot-run') ?? document.querySelector('#run-stream-id').value.trim(); if (!runId) { showToast('Ainda não há uma execução para controlar.', 'info'); return; } const response = await fetch(`/api/v1/runs/${encodeURIComponent(runId)}/${action}`, { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: '{}' }); showToast(response.ok ? action === 'resume' ? 'Autopilot retomado.' : 'Autopilot pausado.' : 'Não foi possível atualizar a execução.', response.ok ? 'success' : 'error'); if (response.ok) await loadState(); }
async function checkFollowUp() { return withBusyButton(followUpCheckButton, 'Consultando…', async () => { const response = await fetch('/api/v1/followup/check', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ instruction: 'acompanhe tudo desta semana' }) }); if (response.ok) { const result = await response.json(); showToast(result.summary ?? 'Acompanhamento atualizado.', 'success'); } else showToast('Não foi possível atualizar o acompanhamento.', 'error'); }); }
async function exportAutopilotEvidence() { const runId = localStorage.getItem('fluxo-autopilot-run') ?? document.querySelector('#run-stream-id').value.trim(); if (!runId) { goTo('operations'); showToast('Ainda não há evidências de uma execução.', 'info'); return; } const response = await fetch(`/api/v1/audit/${encodeURIComponent(runId)}/export`, { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: '{}' }); showToast(response.ok ? 'Pacote de evidências criado localmente.' : 'Não foi possível exportar as evidências.', response.ok ? 'success' : 'error'); goTo('operations'); }

async function searchQueue(event) {
  event?.preventDefault();
  const query = new URLSearchParams(new FormData(queueSearchForm));
  const response = await fetch(`/api/v1/queue/search?${query}`, { cache: 'no-store' });
  if (response.ok) renderQueue({ items: await response.json() });
}

function debounce(handler, delay) { let timer; return (event) => { clearTimeout(timer); timer = setTimeout(() => handler(event), delay); }; }
function classifyFit(classification) { return ({ A: 'forte', B: 'possível', C: 'fraca' })[classification] ?? 'não calculada'; }
function inferPlatformFromUrl(value) {
  const source = String(value ?? '').toLowerCase();
  return Object.entries({ GUPY: ['gupy.com', 'gupy.io'], INFOJOBS: ['infojobs.com'], PANDAPE: ['pandape.com'], LINKEDIN: ['linkedin.com'], CATHO: ['catho.com'], VAGASCOM: ['vagas.com'], SOLIDES: ['solides.com'] }).find(([, fragments]) => fragments.some((fragment) => source.includes(fragment)))?.[0] ?? '';
}
function clearQueueFilter() { queueSearchForm.reset(); loadState(); }

async function addQueueItem(event) {
  event.preventDefault();
  const response = await fetch('/api/v1/queue/items', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(Object.fromEntries(new FormData(queueAddForm))) });
  queueAddForm.querySelector('button').textContent = response.ok ? 'Vaga adicionada' : 'Falha ao adicionar';
  showToast(response.ok ? 'Vaga adicionada à fila.' : 'Não foi possível adicionar a vaga.', response.ok ? 'success' : 'error');
  if (response.ok) await loadState();
}

async function recordFollowUp(event) {
  event.preventDefault();
  const input = Object.fromEntries(new FormData(followUpForm));
  const response = await fetch(`/api/v1/applications/${encodeURIComponent(input.reference)}/events`, { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(input) });
  document.querySelector('#follow-up-feedback').textContent = response.ok ? 'Evento registrado.' : 'Não foi possível registrar.'; showToast(response.ok ? 'Acompanhamento atualizado.' : 'Não foi possível registrar o acompanhamento.', response.ok ? 'success' : 'error');
  if (response.ok) await loadState();
}

async function importLegacy(event) {
  event.preventDefault();
  const response = await fetch('/api/v1/imports/legacy', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(Object.fromEntries(new FormData(legacyImportForm))) });
  document.querySelector('#follow-up-feedback').textContent = response.ok ? 'Controles importados.' : 'Falha na importação.'; showToast(response.ok ? 'Controles importados.' : 'Falha na importação.', response.ok ? 'success' : 'error');
  if (response.ok) await loadState();
}

async function prepareAssessment(event) {
  event.preventDefault();
  const input = Object.fromEntries(new FormData(assessmentPrepForm));
  input.questions = ['question1', 'question2', 'question3'].map((name) => input[name]).filter(Boolean).map((prompt, index) => ({ id: `q-${index + 1}`, prompt }));
  delete input.question1; delete input.question2; delete input.question3; input.durationSeconds = Number(input.durationSeconds || 0);
  const response = await fetch('/api/v1/assessments/prepare', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(input) });
  if (!response.ok) { document.querySelector('#assessment-feedback').textContent = 'Não foi possível preparar.'; return; }
  const result = await response.json(); assessmentRemaining = result.durationSeconds ?? 0; assessmentPauseButton.dataset.paused = 'false'; assessmentPauseButton.textContent = 'Pausar'; assessmentPauseButton.disabled = assessmentRemaining <= 0; updateAssessmentTimer(); clearInterval(assessmentTimer); assessmentTimer = assessmentRemaining > 0 ? setInterval(() => { if (assessmentRemaining > 0 && !assessmentPauseButton.dataset.paused) { assessmentRemaining -= 1; updateAssessmentTimer(); } }, 1000) : null;
  document.querySelector('#assessment-feedback').textContent = 'Questionário preparado; autoria humana exigida.'; showToast('Questionário preparado para revisão humana.', 'success');
}

function toggleAssessmentTimer() { assessmentPauseButton.dataset.paused = assessmentPauseButton.dataset.paused === 'true' ? 'false' : 'true'; assessmentPauseButton.textContent = assessmentPauseButton.dataset.paused === 'true' ? 'Retomar' : 'Pausar'; }
function updateAssessmentTimer() { document.querySelector('#assessment-timer').textContent = assessmentRemaining ? `Tempo informativo: ${assessmentRemaining}s` : 'Sem cronômetro'; }

async function recordAssessment(event) {
  event.preventDefault();
  const response = await fetch('/api/v1/assessments', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(Object.fromEntries(new FormData(assessmentResultForm))) });
  document.querySelector('#assessment-feedback').textContent = response.ok ? 'Resultado registrado.' : 'Não foi possível registrar.'; showToast(response.ok ? 'Resultado registrado.' : 'Não foi possível registrar o resultado.', response.ok ? 'success' : 'error');
  if (response.ok) await loadState();
}

async function prepareApplication() {
  const button = applicationTools.querySelector('[data-application-action="prepare"]');
  return withBusyButton(button, 'Preparando…', async () => {
    const platform = applicationTools.querySelector('[name="platform"]').value;
    const response = await fetch('/api/v1/applications/prepare', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ platform, itemId: pendingQueueItemId }) });
    const feedback = document.querySelector('#application-feedback');
    if (!response.ok) { feedback.textContent = 'Não foi possível preparar a próxima vaga.'; showToast('Não foi possível preparar a candidatura.', 'error'); return; }
    preparedApplication = await response.json();
    pendingQueueItemId = '';
    const run = preparedApplication.run ?? preparedApplication.data?.run;
    const preparedItem = preparedApplication.item ?? preparedApplication.data?.item ?? {};
    renderApplicationReview(preparedItem, preparedApplication.snapshot ?? {}, preparedApplication);
    feedback.textContent = `Preparada: ${run?.id ?? 'run criado'}. Revise antes da aprovação.`;
    applicationTools.querySelector('[data-application-action="approve"]').disabled = false;
    document.querySelector('#run-stream-id').value = run?.id ?? '';
    updateApplicationStepper(1); connectRunStream();
  });
}

async function requestApplicationApproval() {
  const button = applicationTools.querySelector('[data-application-action="approve"]');
  return withBusyButton(button, 'Solicitando aprovação…', async () => {
    const run = preparedApplication?.run ?? preparedApplication?.data?.run;
    if (!run?.id) return;
    submissionPayload = { queueItemId: (preparedApplication.item ?? preparedApplication.data?.item)?.id, fields: preparedApplication.snapshot ?? {}, resume: preparedApplication.resume?.path ?? '' };
    const response = await fetch(`/api/v1/applications/${encodeURIComponent(run.id)}/approval`, { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(submissionPayload) });
    const feedback = document.querySelector('#application-feedback');
    if (!response.ok) { feedback.textContent = 'Não foi possível solicitar aprovação.'; showToast('Não foi possível solicitar aprovação.', 'error'); return; }
    submissionApproval = await response.json();
    submissionApproval = submissionApproval.data ?? submissionApproval;
    feedback.textContent = 'Aprovação criada; decida no painel de aprovações.';
    applicationTools.querySelector('[data-application-action="submit"]').disabled = true;
    updateApplicationStepper(2); showToast('Ação pronta para sua aprovação no painel.', 'info');
    // O painel de aprovações só mostra a decisão pendente depois de reler o estado.
    await loadState();
  });
}

async function submitApplication() {
  const run = preparedApplication?.run ?? preparedApplication?.data?.run;
  if (!run?.id || !submissionApproval?.id || submissionApproval.status !== 'approved') { document.querySelector('#application-feedback').textContent = 'Aprove a ação no painel antes de confirmar.'; return; }
  const button = applicationTools.querySelector('[data-application-action="submit"]');
  return withBusyButton(button, 'Confirmando envio…', async () => {
    const response = await fetch(`/api/v1/applications/${encodeURIComponent(run.id)}/submit`, { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ approvalId: submissionApproval.id, ...submissionPayload }) });
    document.querySelector('#application-feedback').textContent = response.ok ? 'Envio confirmado pela plataforma.' : 'Envio bloqueado; revise aprovação e evidência.';
    if (response.ok) { preparedApplication = null; submissionApproval = null; updateApplicationStepper(3); showToast('Candidatura confirmada com evidência.', 'success'); await loadState(); }
    else showToast('Envio bloqueado; revise aprovação e evidência.', 'error');
  });
}

async function withBusyButton(button, label, action) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try { return await action(); } finally { button.disabled = false; button.textContent = original; }
}

function renderApplicationReview(item, snapshot, prepared = {}) {
  const panel = document.querySelector('#application-review'); panel.hidden = false;
  document.querySelector('#application-status').textContent = 'Revise os dados observados antes de pedir aprovação.';
  const rows = [['Empresa', item.company], ['Cargo', item.role], ['Plataforma', item.platform], ['Identificador/URL', item.identifierOrUrl],
    ['Aderência', item.fitScore != null ? `${item.fitScore}%` : 'não calculada'], ['Tela observada', snapshot.url || 'capturada'],
    ['Currículo anexado', prepared.resume?.path ?? 'nenhuma variante selecionada'],
    ...reviewFieldRows(prepared.fill)];
  const facts = document.querySelector('#application-review-facts');
  facts.replaceChildren(...rows.filter(([, value]) => value).map(([label, value]) => { const term = document.createElement('dt'); term.textContent = label; const detail = document.createElement('dd'); detail.textContent = value; return [term, detail]; }).flat());
}

function reviewFieldRows(fill) {
  if (!fill) return [];
  if (fill.status !== 'preenchido') return [['Preenchimento', `${fill.status}${fill.message ? `: ${fill.message}` : ''}`]];
  const values = Object.entries(fill.values ?? {}).filter(([, value]) => String(value ?? '').trim());
  if (!values.length) return [['Preenchimento', 'nenhum campo confirmado corresponde ao formulário observado']];
  return values.map(([field, value]) => [`Campo ${field}`, String(value)]);
}

function render(state, approvals = [], profile = null, metrics = null, pending = [], assessments = [], registry = [], memory = null, exceptions = [], codex = null) {
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
  renderNextAction(state, profile);
  renderAutopilotMemory(memory ?? {});
  renderAutopilotResults(state.queue);
  renderAutopilotExceptions(exceptions);
  renderCodexControlCenter(codex ?? {});
}

function renderNextAction(state, profile) {
  const copy = document.querySelector('#next-action-copy');
  const configured = profile?.profile?.exists === true && state.campaign.platforms.length > 0;
  if (!configured) { copy.textContent = 'Complete seu perfil e as metas da campanha para começar.'; nextActionButton.textContent = 'Configurar agora'; nextActionHandler = () => goTo('setup'); return; }
  if (!state.installation.ready) { copy.textContent = 'O ambiente precisa passar pelo preflight antes de preparar uma candidatura.'; nextActionButton.textContent = 'Executar preflight'; nextActionHandler = runPreflight; return; }
  if ((state.queue.counts?.['na fila'] ?? 0) > 0) { copy.textContent = 'Há uma vaga elegível esperando revisão.'; nextActionButton.textContent = 'Preparar próxima vaga'; nextActionHandler = () => { goTo('applications'); prepareApplication(); }; return; }
  copy.textContent = 'Sua fila está vazia. Adicione uma vaga para continuar.'; nextActionButton.textContent = 'Adicionar vaga'; nextActionHandler = () => { goTo('queue'); window.setTimeout(() => document.querySelector('#queue-add input[name="company"]').focus(), 150); };
}

function showToast(message, kind = 'info') { const toast = document.querySelector('#toast-region'); toast.textContent = message; toast.dataset.kind = kind; clearTimeout(showToast.timeout); showToast.timeout = setTimeout(() => { toast.textContent = ''; }, 4500); }

function renderOperations(metrics, pending, assessments) {
  const metricsContainer = document.querySelector('#metrics-detail');
  const totals = metrics?.totals ?? {};
  const rates = metrics?.rates ?? {}; const timings = metrics?.timings ?? {};
  metricsContainer.replaceChildren(...[['candidaturas', totals.applications ?? 0], ['confirmadas', totals.confirmed ?? 0], ['na fila', totals.queue ?? 0], ['bloqueadas', totals.blocked ?? 0], ['evidência', `${totals.evidenceCoverage ?? 0}%`], ['falhas', `${rates.failure ?? 0}%`], ['operação média', formatDuration(timings.averageOperationMs ?? 0)]].map(([label, value]) => { const item = document.createElement('div'); item.textContent = `${label}: ${value}`; return item; }));
  renderCompact('#pending-list', pending, (item) => `${item.urgency ?? '—'} · ${item.reference ?? 'sem referência'} · ${item.nextAction ?? ''}`);
  renderCompact('#assessment-list', assessments, (item) => `${item.reference ?? '—'} · ${item.name ?? 'teste'} · ${item.status ?? 'sem resultado'}`);
}

function formatDuration(milliseconds) { const seconds = Math.round(Number(milliseconds) / 1000); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}min`; }

function connectRunStream() {
  const runId = document.querySelector('#run-stream-id').value.trim();
  const feedback = document.querySelector('#stream-feedback');
  if (!runId) { feedback.textContent = 'Informe um run ID.'; return; }
  runEventSource?.close();
  const output = document.querySelector('#run-events'); output.textContent = '';
  runEventSource = new EventSource(`/api/v1/runs/${encodeURIComponent(runId)}/events?stream=1`);
  runEventSource.onopen = () => { feedback.textContent = 'Streaming conectado.'; };
  runEventSource.onerror = () => { feedback.textContent = 'Streaming interrompido; verifique o run.'; };
  for (const type of ['agent.notification', 'agent.thread.started', 'agent.turn.started', 'turn/completed', 'turn/started', 'item/agentMessage/delta', 'agent.turn.completed', 'autopilot.plan.created', 'autopilot.thread.started', 'autopilot.started', 'autopilot.failed', 'autopilot.waiting_user', 'autopilot.task.completed', 'autopilot.completed', 'autopilot.exception', 'application.prepared', 'application.submission_confirmed', 'run.needs_reconcile', 'run.paused', 'run.resumed']) runEventSource.addEventListener(type, (event) => {
    output.textContent += `${event.type}: ${event.data}\n`;
    try { applyAutopilotEvent(event.type, JSON.parse(event.data), runId); } catch {}
  });
}

function applyAutopilotEvent(type, payload, runId) {
  const run = { id: payload.runId ?? runId };
  if (type === 'autopilot.plan.created') renderAutopilot({ ...payload, run });
  if (type === 'autopilot.started') document.querySelector('#autopilot-status').textContent = 'A IA está trabalhando…';
  if (type === 'autopilot.waiting_user') renderAutopilot({ run, status: 'waiting_user', message: payload.message, plan: payload.plan, result: { questions: payload.questions } });
  if (type === 'autopilot.task.completed') document.querySelector('#autopilot-status').textContent = `Etapa concluída: ${payload.task}.`;
  if (type === 'autopilot.completed') renderAutopilot({ run, status: 'succeeded', message: 'A jornada foi concluída com resultados confirmados.' });
  if (type === 'autopilot.exception') renderAutopilot({ run, status: 'needs_attention', exception: payload.message, plan: payload.plan });
  if (type === 'autopilot.failed') renderAutopilot({ run, status: 'exception', exception: payload.error ?? 'O Autopilot encontrou uma falha.' });
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
  feedback.textContent = operation === 'select' ? `Resultado: ${result.output ?? 'currículo selecionado'}` : operation === 'extract' ? `Extraído: ${result.path ?? 'ok'}` : `Aderência: ${result.score ?? 0}% · ${classifyFit(result.classification)} (${result.classification ?? '—'})`;
}

function renderOnboarding(state, profile) {
  const section = document.querySelector('#onboarding-section');
  const configured = profile?.profile?.exists === true && state.campaign.platforms.length > 0;
  section.hidden = configured || activeRoute !== 'setup';
}

async function saveOnboarding(event) {
  event.preventDefault();
  const feedback = document.querySelector('#onboarding-feedback');
  const formData = new FormData(onboardingForm);
  const data = Object.fromEntries(formData);
  data.platforms = formData.getAll('platforms');
  data.campaign = {
    totalGoal: Number(data.totalGoal), dailyGoal: Number(data.dailyGoal), weeklyGoal: Number(data.weeklyGoal),
    periodStart: data.periodStart, periodEnd: data.periodEnd, exclusions: splitValues(data.exclusions), filters: { roles: splitValues(data.rolesFilter), seniority: splitValues(data.seniorityFilter) },
    platforms: data.platforms.map((name) => ({ name, enabled: true, goal: 0 }))
  };
  delete data.totalGoal; delete data.dailyGoal; delete data.weeklyGoal; delete data.platforms; delete data.periodStart; delete data.periodEnd; delete data.exclusions; delete data.rolesFilter; delete data.seniorityFilter;
  feedback.textContent = 'Salvando…';
  const response = await fetch('/api/v1/onboarding', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(data) });
  feedback.textContent = response.ok ? 'Configuração salva localmente.' : 'Não foi possível salvar. Revise os campos.';
  if (response.ok) { localStorage.removeItem('fluxo-onboarding-draft'); localStorage.removeItem('fluxo-onboarding-step'); hideOnboardingErrors(); await loadState(); }
  else { let message = 'Não foi possível salvar. Revise os dados e tente novamente.'; try { message = (await response.clone().json()).error?.message ?? message; } catch {} showOnboardingErrors([onboardingForm.querySelector('input:invalid, textarea:invalid, select:invalid')].filter(Boolean), message); }
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
    row.innerHTML = `<div><strong>${escapeHtml(approval.kind)}</strong><small>${escapeHtml(approval.status)} · expira ${escapeHtml(approval.expiresAt)} · run ${escapeHtml(approval.runId)}</small></div><div class="approval-actions"></div>`;
    row.querySelector('div').append(renderApprovalDetails(approval));
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

function renderApprovalDetails(approval) {
  const details = document.createElement('details'); details.className = 'approval-details';
  const summary = document.createElement('summary'); summary.textContent = 'Ver detalhes da ação'; details.append(summary);
  const facts = document.createElement('dl');
  for (const [key, value] of Object.entries(approval.payloadSummary ?? {}).slice(0, 12)) { const term = document.createElement('dt'); term.textContent = humanize(key); const detail = document.createElement('dd'); detail.textContent = formatValue(value); facts.append(term, detail); }
  if (approval.payloadHash) { const term = document.createElement('dt'); term.textContent = 'Hash da aprovação'; const detail = document.createElement('dd'); detail.textContent = approval.payloadHash; facts.append(term, detail); }
  details.append(facts); return details;
}

function humanize(value) { return String(value).replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^./, (letter) => letter.toUpperCase()); }
function formatValue(value) { return typeof value === 'object' ? Object.entries(value).map(([key, entry]) => `${humanize(key)}: ${entry}`).join(' · ') : String(value ?? '—'); }

function updateApplicationStepper(active) { document.querySelectorAll('#application-stepper span').forEach((item, index) => item.classList.toggle('is-current', index === active)); }

async function decideApproval(id, decision) {
  const response = await fetch(`/api/v1/approvals/${encodeURIComponent(id)}/decision`, {
    method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ decision, actorId: 'local-user' })
  });
  if (response.ok) { if (submissionApproval?.id === id) submissionApproval.status = decision; applicationTools.querySelector('[data-application-action="submit"]').disabled = decision !== 'approved'; if (decision === 'approved') { updateApplicationStepper(3); showToast('Ação aprovada. Confirme somente após a plataforma sinalizar sucesso.', 'success'); } else showToast('Ação rejeitada.', 'info'); await loadState(); }
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
    container.textContent = 'Nenhuma vaga encontrada. Adicione uma vaga ou ajuste os filtros.';
    return;
  }
  container.className = 'data-list';
  container.replaceChildren(...queue.items.slice(0, 8).map((item) => {
    const row = document.createElement('article');
    row.className = 'data-row';
    row.innerHTML = `<span class="row-mark">${escapeHtml(item.priority || '—')}</span><div class="row-main"><strong>${escapeHtml(item.role || 'Vaga sem cargo')}</strong><small>${escapeHtml(`${item.company || 'Empresa não informada'} · ${item.platform || 'plataforma não informada'}`)}</small></div><div class="row-meta"><strong>${escapeHtml(item.status || 'sem status')}</strong><small>${escapeHtml(item.fitScore != null ? `${item.fitScore}% aderência` : 'aderência não calculada')}</small><small>${escapeHtml(item.deadline ? `prazo ${item.deadline}` : `tentativa ${item.attempts ?? 0}`)}</small></div>`;
    if (item.lastError) { const error = document.createElement('small'); error.className = 'row-error'; error.textContent = `Atenção: ${item.lastError}`; row.querySelector('.row-main').append(error); }
    if (item.status === 'na fila' && item.id) {
      const button = document.createElement('button');
      button.className = 'row-action';
      button.type = 'button';
      button.textContent = 'Preparar esta vaga';
      button.addEventListener('click', () => claimQueueItem(item));
      row.append(button);
    }
    return row;
  }));
}

async function claimQueueItem(item) {
  pendingQueueItemId = item.id;
  const platform = item.platform ?? '';
  const platformSelect = applicationTools.querySelector('[name="platform"]');
  if (platform) platformSelect.value = platform;
  goTo('applications');
  await prepareApplication();
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
    if (Array.isArray(item.history) && item.history.length) { const timeline = document.createElement('details'); timeline.className = 'row-timeline'; const summary = document.createElement('summary'); summary.textContent = `${item.history.length} atualização${item.history.length > 1 ? 'ões' : ''}`; timeline.append(summary, ...item.history.slice(-4).reverse().map((entry) => { const line = document.createElement('small'); line.textContent = `${entry.at ?? ''} · ${entry.type ?? 'evento'} · ${entry.note ?? entry.status ?? ''}`; return line; })); row.querySelector('.row-main').append(timeline); }
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

async function importResumeFile(file) {
  const contentBase64 = await fileToBase64(file);
  const response = await fetch('/api/v1/resumes/import', { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ filename: file.name, contentBase64 }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? 'A importação só é anunciada depois de verificar o arquivo.');
  return payload.data ?? payload;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

mountPersistence(mutationHeaders);
refreshProductPolicy();

async function refreshProductPolicy() {
  try {
    const response = await fetch('/api/v1/product/policy', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const banner = document.querySelector('#lifecycle-banner');
    if (banner) banner.textContent = data.lifecycle ?? data.data?.lifecycle ?? '';
  } catch {}
}
