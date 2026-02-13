/**
 * Beads Page
 * List + detail bottom sheet view.
 */

import api from '../api.js';
import {
  createBadge,
  createBottomSheet,
  createLoadingSkeleton,
  createToast
} from '../components.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'Todo' },
  { key: 'active', label: 'Active' },
  { key: 'done', label: 'Done' },
  { key: 'failed', label: 'Failed' }
];

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

function formatRelativeTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function normalizePriority(priority) {
  const p = Number(priority);
  if (p === 1) return { label: 'High', tone: 'danger' };
  if (p === 2) return { label: 'Medium', tone: 'warning' };
  if (p === 3) return { label: 'Low', tone: 'info' };
  return { label: 'Unknown', tone: 'dim' };
}

function calculateCounts(beads) {
  const counts = {
    all: beads.length,
    todo: 0,
    active: 0,
    done: 0,
    failed: 0
  };

  beads.forEach((bead) => {
    const status = String(bead?.status || '').toLowerCase();
    if (status in counts) {
      counts[status] += 1;
    }
  });

  return counts;
}

function sortBeads(beads, sortBy) {
  const sorted = [...beads];

  switch (sortBy) {
    case 'created':
      return sorted.sort((a, b) => new Date(b.created) - new Date(a.created));
    case 'priority':
      return sorted.sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99));
    case 'updated':
    default:
      return sorted.sort((a, b) => new Date(b.updated) - new Date(a.updated));
  }
}

function createBeadCard(bead) {
  const card = document.createElement('article');
  card.className = 'card card-compact bead-card card-appear';
  card.dataset.beadId = bead.id;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Open bead ${bead.id}`);

  const header = document.createElement('header');
  header.className = 'bead-card-header';

  const identity = document.createElement('div');
  identity.className = 'bead-card-identity';

  const priority = normalizePriority(bead.priority);
  const priorityDot = document.createElement('span');
  priorityDot.className = `priority-dot priority-${String(bead.priority)}`;
  priorityDot.dataset.tone = priority.tone;

  const id = document.createElement('span');
  id.className = 'bead-id';
  id.textContent = bead.id;

  identity.append(priorityDot, id);

  const status = createBadge(bead.status);
  status.classList.add('bead-status-badge');

  header.append(identity, status);

  const title = document.createElement('h3');
  title.className = 'bead-title';
  title.textContent = bead.title || 'Untitled bead';

  const meta = document.createElement('div');
  meta.className = 'bead-timestamps';
  meta.textContent = `Updated ${formatRelativeTime(bead.updated)} • Created ${formatRelativeTime(bead.created)}`;

  card.append(header, title, meta);
  return card;
}

function renderFilterTabs(container, counts, activeFilter) {
  container.innerHTML = '';

  FILTERS.forEach((filter) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-sm filter-tab ${filter.key === activeFilter ? 'active' : 'btn-ghost'}`;
    button.dataset.filter = filter.key;
    button.setAttribute('aria-pressed', String(filter.key === activeFilter));
    button.textContent = `${filter.label} (${counts[filter.key] || 0})`;
    container.appendChild(button);
  });
}

function renderBeadList(container, beads) {
  container.innerHTML = '';

  if (!beads || beads.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No beads found for this filter.';
    container.appendChild(empty);
    return;
  }

  beads.forEach((bead, index) => {
    const card = createBeadCard(bead);
    card.style.animationDelay = `${index * 50}ms`;
    container.appendChild(card);
  });
}

function createRunMiniCard(run) {
  const card = document.createElement('article');
  card.className = 'card card-compact run-mini-card';

  const heading = document.createElement('div');
  heading.className = 'run-mini-head';

  const badge = createBadge((run.exit_code === 0 || run.status === 'success') ? 'done' : (run.status || 'failed'));

  const id = document.createElement('span');
  id.className = 'run-mini-id';
  id.textContent = run.bead || run.session_name || 'Unknown run';

  heading.append(id, badge);

  const meta = document.createElement('div');
  meta.className = 'run-mini-meta';
  meta.textContent = `${run.agent || 'agent'} • ${formatDateTime(run.started_at)} • ${run.duration_seconds ?? '-'}s`;

  card.append(heading, meta);
  return card;
}

async function loadRunsForBead(beadId) {
  const encoded = encodeURIComponent(beadId);
  return api.get(`/runs?bead=${encoded}`);
}

function renderDetailContent(bead, runs) {
  const wrapper = document.createElement('div');
  wrapper.className = 'bead-detail-content';

  const top = document.createElement('div');
  top.className = 'bead-detail-top';

  const idRow = document.createElement('div');
  idRow.className = 'bead-detail-id';
  idRow.textContent = bead.id;

  const status = createBadge(bead.status);
  top.append(idRow, status);

  const title = document.createElement('h3');
  title.className = 'bead-detail-title';
  title.textContent = bead.title || 'Untitled bead';

  const priority = normalizePriority(bead.priority);
  const details = document.createElement('dl');
  details.className = 'bead-detail-meta';

  const rows = [
    ['Priority', `${priority.label} (${bead.priority ?? '-'})`],
    ['Created', formatDateTime(bead.created)],
    ['Updated', formatDateTime(bead.updated)]
  ];

  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    row.append(dt, dd);
    details.appendChild(row);
  });

  const runsHeading = document.createElement('h4');
  runsHeading.className = 'section-title';
  runsHeading.textContent = 'Linked Runs';

  const runsWrap = document.createElement('div');
  runsWrap.className = 'bead-linked-runs';

  if (!runs || runs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No run records found for this bead.';
    runsWrap.appendChild(empty);
  } else {
    runs.forEach((run) => {
      runsWrap.appendChild(createRunMiniCard(run));
    });
  }

  wrapper.append(top, title, details, runsHeading, runsWrap);
  return wrapper;
}

function resolveCurrentBead(state, beadId) {
  return state.currentBeads.find((bead) => bead.id === beadId)
    || state.allBeads.find((bead) => bead.id === beadId)
    || null;
}

async function fetchForFilter(state) {
  if (state.activeFilter === 'all') {
    return [...state.allBeads];
  }

  const data = await api.get(`/beads?status=${encodeURIComponent(state.activeFilter)}`);
  return Array.isArray(data) ? data : [];
}

async function refresh(scope, state) {
  const list = scope.querySelector('#beads-list');
  const tabs = scope.querySelector('#beads-filter-tabs');
  const sortSelect = scope.querySelector('#beads-sort-select');

  if (!list || !tabs || !sortSelect) return;

  const counts = calculateCounts(state.allBeads);
  renderFilterTabs(tabs, counts, state.activeFilter);
  sortSelect.value = state.sortBy;

  const sorted = sortBeads(state.currentBeads, state.sortBy);
  renderBeadList(list, sorted);
}

export function render() {
  return `
    <div class="container page-shell page-beads">
      <header class="page-header">
        <h1 class="page-title">Beads</h1>
        <p class="page-subtitle">Task queue, filtering, and bead run context.</p>
      </header>

      <section class="beads-layout">
        <div class="beads-toolbar card card-compact">
          <div id="beads-filter-tabs" class="filter-tabs" aria-label="Filter beads"></div>
          <label class="beads-sort" for="beads-sort-select">
            <span class="text-sm text-secondary">Sort</span>
            <select id="beads-sort-select" class="beads-sort-select" aria-label="Sort beads">
              <option value="updated">Updated</option>
              <option value="created">Created</option>
              <option value="priority">Priority</option>
            </select>
          </label>
        </div>

        <div id="beads-list" class="beads-list" aria-live="polite">
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
        </div>
      </section>
    </div>
  `;
}

export async function mount(root) {
  const scope = root?.querySelector('.page-beads') || document.querySelector('.page-beads');
  if (!scope) return () => {};

  const state = {
    allBeads: [],
    currentBeads: [],
    activeFilter: 'all',
    sortBy: 'updated'
  };

  const detailSheet = createBottomSheet({
    title: 'Bead details',
    content: createLoadingSkeleton('card')
  });

  async function openDetail(bead) {
    detailSheet.setTitle(`Bead ${bead.id}`);
    detailSheet.setContent(createLoadingSkeleton('card'));
    detailSheet.open();

    try {
      const runs = await loadRunsForBead(bead.id);
      detailSheet.setContent(renderDetailContent(bead, runs));
    } catch (error) {
      detailSheet.setContent(renderDetailContent(bead, []));
      createToast({
        type: 'error',
        message: error?.message || 'Failed to load linked runs'
      });
    }
  }

  async function reloadCurrentFilter() {
    state.currentBeads = await fetchForFilter(state);
    await refresh(scope, state);
  }

  async function handleFilterClick(event) {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    const nextFilter = button.dataset.filter;
    if (!nextFilter || nextFilter === state.activeFilter) return;

    state.activeFilter = nextFilter;
    try {
      await reloadCurrentFilter();
    } catch (error) {
      createToast({ type: 'error', message: error?.message || 'Failed to filter beads' });
    }
  }

  function handleSortChange(event) {
    state.sortBy = event.target.value || 'updated';
    refresh(scope, state);
  }

  function onCardActivate(event) {
    const card = event.target.closest('.bead-card');
    if (!card) return;

    const bead = resolveCurrentBead(state, card.dataset.beadId);
    if (!bead) return;
    openDetail(bead);
  }

  function onCardKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.bead-card');
    if (!card) return;
    event.preventDefault();

    const bead = resolveCurrentBead(state, card.dataset.beadId);
    if (!bead) return;
    openDetail(bead);
  }

  const tabs = scope.querySelector('#beads-filter-tabs');
  const sortSelect = scope.querySelector('#beads-sort-select');
  const list = scope.querySelector('#beads-list');

  tabs?.addEventListener('click', handleFilterClick);
  sortSelect?.addEventListener('change', handleSortChange);
  list?.addEventListener('click', onCardActivate);
  list?.addEventListener('keydown', onCardKeyDown);

  try {
    const beads = await api.get('/beads');
    state.allBeads = Array.isArray(beads) ? beads : [];
    state.currentBeads = [...state.allBeads];
    await refresh(scope, state);
  } catch (error) {
    createToast({ type: 'error', message: error?.message || 'Failed to load beads' });
    const container = scope.querySelector('#beads-list');
    if (container) {
      container.innerHTML = '';
      const err = document.createElement('div');
      err.className = 'empty-state';
      err.textContent = 'Unable to load beads right now. Please try again.';
      container.appendChild(err);
    }
  }

  return () => {
    tabs?.removeEventListener('click', handleFilterClick);
    sortSelect?.removeEventListener('change', handleSortChange);
    list?.removeEventListener('click', onCardActivate);
    list?.removeEventListener('keydown', onCardKeyDown);
    if (detailSheet.isOpen()) {
      detailSheet.close();
    }
  };
}
