import { summarizePreflight } from './preflight-summary.js';

const refreshButton = document.querySelector('#refresh');
const preflightButton = document.querySelector('#run-preflight');

refreshButton.addEventListener('click', loadState);
preflightButton.addEventListener('click', runPreflight);
loadState();

async function loadState() {
  refreshButton.disabled = true;
  refreshButton.classList.add('is-loading');
  try {
    const [response, approvalsResponse] = await Promise.all([
      fetch('/api/v1/state', { cache: 'no-store' }),
      fetch('/api/v1/approvals', { cache: 'no-store' })
    ]);
    if (!response.ok) throw new Error('state_read_failed');
    render(await response.json(), approvalsResponse.ok ? await approvalsResponse.json() : []);
  } catch {
    renderUnavailable();
  } finally {
    refreshButton.disabled = false;
    refreshButton.classList.remove('is-loading');
  }
}

function render(state, approvals = []) {
  const ready = state.installation.ready;
  document.querySelector('#installation-status').textContent = ready ? 'Pronto para operar' : 'Atenção necessária';
  document.querySelector('#installation-dot').classList.toggle('is-ready', ready);
  document.querySelector('#preflight-summary').textContent = summarizePreflight(state.preflight);
  document.querySelector('#freshness').textContent = `Leitura local · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  renderMetrics(state);
  renderPlatforms(state.campaign.platforms);
  renderQueue(state.queue);
  renderApplications(state.applications);
  renderCheckpoint(state.checkpoint);
  renderApprovals(approvals);
}

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
    row.innerHTML = `<div><strong>${escapeHtml(approval.kind)}</strong><small>${escapeHtml(approval.status)} · expira ${escapeHtml(approval.expiresAt)}</small></div><div class="approval-actions"></div>`;
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
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision, actorId: 'local-user' })
  });
  if (response.ok) await loadState();
}

async function runPreflight() {
  preflightButton.disabled = true;
  preflightButton.textContent = 'Executando…';
  try {
    await fetch('/api/v1/preflight/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
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

function renderPlatforms(platforms) {
  const container = document.querySelector('#campaign-platforms');
  if (!platforms.length) {
    container.textContent = 'Nenhuma plataforma configurada.';
    container.className = 'platform-list empty-state';
    return;
  }
  container.className = 'platform-list';
  container.replaceChildren(...platforms.map((platform) => {
    const item = document.createElement('div');
    item.className = 'platform-row';
    item.innerHTML = `<strong>${escapeHtml(platform.name || '—')}</strong><span>${escapeHtml(platform.enabled ? 'habilitada' : 'desabilitada')}</span><b>${escapeHtml(platform.goal ?? 0)}</b>`;
    return item;
  }));
}

function renderQueue(queue) {
  document.querySelector('#queue-count').textContent = `${queue.items.length} ${queue.items.length === 1 ? 'vaga' : 'vagas'}`;
  renderList('#queue-list', queue.items, (item) => [item.priority || '—', item.role || 'Vaga sem cargo', `${item.company || 'Empresa não informada'} · ${item.platform || 'plataforma não informada'}`, item.status || 'sem status', item.fitScore != null ? `${item.fitScore}% aderência` : 'aderência não calculada']);
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
