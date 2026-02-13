/**
 * Chronicle Page
 * Run history with filters and expandable details.
 */

import api from '../api.js';
import { createBadge, createLoadingSkeleton, createStatBox, createToast } from '../components.js';

function formatDateTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function resolveStatus(run) {
  if (run?.status === 'running') return 'running';
  if (run?.exit_code === 0 || run?.status === 'success' || run?.status === 'done') return 'done';
  if (run?.exit_code === null || run?.exit_code === undefined) return 'todo';
  return 'failed';
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '-';
  const value = Number(seconds);
  if (Number.isNaN(value)) return '-';

  if (value < 60) return `${Math.round(value)}s`;
  const mins = Math.floor(value / 60);
  const remaining = Math.round(value % 60);
  return `${mins}m ${remaining}s`;
}

function buildFilterQuery(state) {
  const params = new URLSearchParams();

  if (state.filters.status && state.filters.status !== 'all') {
    params.set('status', state.filters.status);
  }

  if (state.filters.date) {
    params.set('date', state.filters.date);
  }

  if (state.filters.agent && state.filters.agent !== 'all') {
    params.set('agent', state.filters.agent);
  }

  const query = params.toString();
  return query ? `/runs?${query}` : '/runs';
}

function computeStats(runs) {
  const total = runs.length;
  const completed = runs.filter((run) => run.exit_code !== null && run.exit_code !== undefined);
  const successCount = completed.filter((run) => run.exit_code === 0 || run.status === 'success').length;
  const successRate = completed.length > 0 ? Math.round((successCount / completed.length) * 100) : 0;

  const durations = runs
    .map((run) => Number(run.duration_seconds))
    .filter((value) => Number.isFinite(value) && value >= 0);

  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0;

  return { total, successRate, avgDuration };
}

function createStatGrid(stats) {
  const grid = document.createElement('div');
  grid.className = 'chronicle-stats-grid';

  const total = createStatBox({ label: 'Total Runs', value: String(stats.total) });
  total.dataset.statId = 'runs-total';

  const success = createStatBox({ label: 'Success Rate', value: `${stats.successRate}%` });
  success.dataset.statId = 'runs-success-rate';

  const avg = createStatBox({ label: 'Avg Duration', value: formatDuration(stats.avgDuration) });
  avg.dataset.statId = 'runs-avg-duration';

  grid.append(total, success, avg);
  return grid;
}

function createVerificationRows(verification) {
  const wrap = document.createElement('div');
  wrap.className = 'run-verification';

  if (!verification || typeof verification !== 'object') {
    const empty = document.createElement('div');
    empty.className = 'text-secondary text-sm';
    empty.textContent = 'No verification payload recorded.';
    wrap.appendChild(empty);
    return wrap;
  }

  Object.entries(verification).forEach(([key, value]) => {
    const row = document.createElement('div');
    row.className = 'run-verification-row';

    const label = document.createElement('span');
    label.className = 'run-verification-key';
    label.textContent = key;

    const output = document.createElement('span');
    output.className = 'run-verification-value';
    output.textContent = typeof value === 'object' ? JSON.stringify(value) : String(value);

    row.append(label, output);
    wrap.appendChild(row);
  });

  return wrap;
}

function createRunCard(run, expanded) {
  const card = document.createElement('article');
  card.className = `card run-card${expanded ? ' expanded' : ''}`;
  card.dataset.runId = run.bead || run.session_name || run.started_at || Math.random().toString(36);
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-expanded', String(expanded));
  card.setAttribute('aria-label', `Toggle run details for ${run.bead || 'run'}`);

  const top = document.createElement('header');
  top.className = 'run-card-top';

  const left = document.createElement('div');
  left.className = 'run-card-main';

  const bead = document.createElement('div');
  bead.className = 'run-card-bead';
  bead.textContent = run.bead || run.session_name || 'Unknown run';

  const meta = document.createElement('div');
  meta.className = 'run-card-meta';
  meta.textContent = `${run.agent || 'unknown agent'} • ${run.model || 'unknown model'} • ${formatDateTime(run.started_at)}`;

  left.append(bead, meta);

  const right = document.createElement('div');
  right.className = 'run-card-status';

  const badge = createBadge(resolveStatus(run));
  const duration = document.createElement('span');
  duration.className = 'run-card-duration';
  duration.textContent = formatDuration(run.duration_seconds);

  right.append(badge, duration);
  top.append(left, right);
  card.appendChild(top);

  if (expanded) {
    const details = document.createElement('div');
    details.className = 'run-card-details';

    const extra = document.createElement('dl');
    extra.className = 'run-detail-grid';

    const detailRows = [
      ['Attempt', `${run.attempt ?? '-'} / ${run.max_retries ?? '-'}`],
      ['Prompt Hash', run.prompt_hash || '-'],
      ['Exit Code', String(run.exit_code ?? '-')],
      ['Finished', formatDateTime(run.finished_at)]
    ];

    detailRows.forEach(([label, value]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      row.append(dt, dd);
      extra.appendChild(row);
    });

    details.append(extra, createVerificationRows(run.verification));
    card.appendChild(details);
  }

  return card;
}

function renderRuns(scope, state) {
  const list = scope.querySelector('#chronicle-runs');
  const statsContainer = scope.querySelector('#chronicle-stats');
  if (!list || !statsContainer) return;

  list.innerHTML = '';
  statsContainer.innerHTML = '';

  const stats = computeStats(state.runs);
  statsContainer.appendChild(createStatGrid(stats));

  if (state.runs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No runs found for the selected filters.';
    list.appendChild(empty);
    return;
  }

  state.runs.forEach((run, index) => {
    const id = run.bead || run.session_name || run.started_at;
    const card = createRunCard(run, state.expanded.has(id));
    card.style.animationDelay = `${index * 50}ms`;
    list.appendChild(card);
  });
}

function renderAgentOptions(scope, state) {
  const select = scope.querySelector('#chronicle-filter-agent');
  if (!select) return;

  const previous = state.filters.agent || 'all';
  const agents = Array.from(new Set(state.rawRuns.map((run) => run.agent).filter(Boolean))).sort();

  select.innerHTML = '<option value="all">All agents</option>';
  agents.forEach((agent) => {
    const option = document.createElement('option');
    option.value = agent;
    option.textContent = agent;
    select.appendChild(option);
  });

  select.value = agents.includes(previous) ? previous : 'all';
  state.filters.agent = select.value;
}

export function render() {
  return `
    <div class="container page-shell page-chronicle">
      <header class="page-header">
        <h1 class="page-title">Chronicle</h1>
        <p class="page-subtitle">Run history, outcomes, and verification traces.</p>
      </header>

      <section class="card chronicle-filters" aria-label="Run filters">
        <label>
          <span class="text-sm text-secondary">Date</span>
          <input id="chronicle-filter-date" type="date" class="chronicle-input" aria-label="Filter by date">
        </label>

        <label>
          <span class="text-sm text-secondary">Status</span>
          <select id="chronicle-filter-status" class="chronicle-input" aria-label="Filter by status">
            <option value="all">All</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
        </label>

        <label>
          <span class="text-sm text-secondary">Agent</span>
          <select id="chronicle-filter-agent" class="chronicle-input" aria-label="Filter by agent">
            <option value="all">All agents</option>
          </select>
        </label>
      </section>

      <section id="chronicle-stats" class="chronicle-stats">
        <div class="skeleton skeleton-card"></div>
      </section>

      <section id="chronicle-runs" class="chronicle-runs" aria-live="polite">
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
      </section>
    </div>
  `;
}

export async function mount(root) {
  const scope = root?.querySelector('.page-chronicle') || document.querySelector('.page-chronicle');
  if (!scope) return () => {};

  const state = {
    rawRuns: [],
    runs: [],
    filters: {
      status: 'all',
      date: '',
      agent: 'all'
    },
    expanded: new Set()
  };

  const dateInput = scope.querySelector('#chronicle-filter-date');
  const statusInput = scope.querySelector('#chronicle-filter-status');
  const agentInput = scope.querySelector('#chronicle-filter-agent');
  const runsContainer = scope.querySelector('#chronicle-runs');

  async function loadRuns() {
    const url = buildFilterQuery(state);
    const runs = await api.get(url);
    state.runs = Array.isArray(runs) ? runs : [];

    if (state.filters.status === 'all' && state.filters.date === '') {
      state.rawRuns = [...state.runs];
      renderAgentOptions(scope, state);
    }

    renderRuns(scope, state);
  }

  function onFilterChange() {
    state.filters.date = dateInput?.value || '';
    state.filters.status = statusInput?.value || 'all';
    state.filters.agent = agentInput?.value || 'all';
    state.expanded.clear();

    loadRuns().catch((error) => {
      createToast({ type: 'error', message: error?.message || 'Failed to load run history' });
    });
  }

  function toggleExpanded(event) {
    const card = event.target.closest('.run-card');
    if (!card) return;

    const runId = card.dataset.runId;
    if (!runId) return;

    if (state.expanded.has(runId)) {
      state.expanded.delete(runId);
    } else {
      state.expanded.add(runId);
    }

    renderRuns(scope, state);
  }

  function onCardKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.run-card');
    if (!card) return;

    event.preventDefault();
    toggleExpanded(event);
  }

  dateInput?.addEventListener('change', onFilterChange);
  statusInput?.addEventListener('change', onFilterChange);
  agentInput?.addEventListener('change', onFilterChange);
  runsContainer?.addEventListener('click', toggleExpanded);
  runsContainer?.addEventListener('keydown', onCardKeyDown);

  try {
    const initial = await api.get('/runs');
    state.rawRuns = Array.isArray(initial) ? initial : [];
    state.runs = [...state.rawRuns];
    renderAgentOptions(scope, state);
    renderRuns(scope, state);
  } catch (error) {
    state.runs = [];
    renderRuns(scope, state);
    createToast({ type: 'error', message: error?.message || 'Failed to load run history' });
  }

  return () => {
    dateInput?.removeEventListener('change', onFilterChange);
    statusInput?.removeEventListener('change', onFilterChange);
    agentInput?.removeEventListener('change', onFilterChange);
    runsContainer?.removeEventListener('click', toggleExpanded);
    runsContainer?.removeEventListener('keydown', onCardKeyDown);
  };
}
