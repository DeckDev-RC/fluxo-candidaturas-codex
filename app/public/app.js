import { summarizePreflight } from './preflight-summary.js';

const refreshButton = document.querySelector('#refresh');

refreshButton.addEventListener('click', loadState);
loadState();

async function loadState() {
  refreshButton.disabled = true;
  refreshButton.classList.add('is-loading');
  try {
    const response = await fetch('/api/v1/state', { cache: 'no-store' });
    if (!response.ok) throw new Error('state_read_failed');
    render(await response.json());
  } catch {
    renderUnavailable();
  } finally {
    refreshButton.disabled = false;
    refreshButton.classList.remove('is-loading');
  }
}

function render(state) {
  const ready = state.installation.ready;
  document.querySelector('#installation-status').textContent = ready ? 'Pronto para operar' : 'Atenção necessária';
  document.querySelector('#installation-dot').classList.toggle('is-ready', ready);
  document.querySelector('#preflight-summary').textContent = summarizePreflight(state.preflight);
  document.querySelector('#freshness').textContent = `Leitura local · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  renderMetrics(state);
  renderQueue(state.queue);
  renderApplications(state.applications);
  renderCheckpoint(state.checkpoint);
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
