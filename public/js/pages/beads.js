/**
 * Beads Page
 * View and manage beads (tasks) with filtering, sorting, and detail view
 */

import api from '../api.js';
import { createBadge, createLoadingSkeleton } from '../components.js';

// Only run in browser environment
if (typeof window !== 'undefined') {
  window.beadsPageState = {
    beads: [],
    activeFilter: 'all',
    sortBy: 'updated'
  };
}

/**
 * Calculate bead counts by status
 */
function calculateCounts(beads) {
  const counts = {
    all: beads.length,
    todo: 0,
    active: 0,
    done: 0,
    failed: 0
  };

  beads.forEach(bead => {
    const status = bead.status.toLowerCase();
    if (counts.hasOwnProperty(status)) {
      counts[status]++;
    }
  });

  return counts;
}

/**
 * Filter beads by status
 */
function filterBeads(beads, status) {
  if (status === 'all') return beads;
  return beads.filter(bead => bead.status.toLowerCase() === status);
}

/**
 * Sort beads by field
 */
function sortBeads(beads, sortBy) {
  const sorted = [...beads];

  switch (sortBy) {
    case 'created':
      return sorted.sort((a, b) => new Date(b.created) - new Date(a.created));
    case 'priority':
      return sorted.sort((a, b) => a.priority - b.priority);
    case 'updated':
    default:
      return sorted.sort((a, b) => new Date(b.updated) - new Date(a.updated));
  }
}

/**
 * Create a bead card element
 */
function createBeadCard(bead) {
  const card = document.createElement('article');
  card.className = 'card card-compact bead-card';
  card.dataset.beadId = bead.id;

  // Priority dot
  const priorityDot = document.createElement('span');
  priorityDot.className = `priority-dot priority-${bead.priority}`;
  priorityDot.style.cssText = `
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 8px;
    background-color: ${getPriorityColor(bead.priority)};
  `;

  // Header with ID and status
  const header = document.createElement('div');
  header.className = 'card-header';
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';

  const idSpan = document.createElement('span');
  idSpan.className = 'bead-id';
  idSpan.style.cssText = 'font-size: 12px; color: var(--text-secondary); font-family: monospace;';
  idSpan.appendChild(priorityDot);
  idSpan.appendChild(document.createTextNode(bead.id));

  const badge = createBadge(bead.status);

  header.appendChild(idSpan);
  header.appendChild(badge);

  // Title
  const title = document.createElement('h3');
  title.className = 'bead-title';
  title.style.cssText = 'margin: 0 0 8px 0; font-size: 16px; color: var(--text-primary);';
  title.textContent = bead.title;

  // Timestamps
  const timestamps = document.createElement('div');
  timestamps.className = 'bead-timestamps';
  timestamps.style.cssText = 'font-size: 12px; color: var(--text-dim);';

  const updated = new Date(bead.updated);
  const created = new Date(bead.created);
  timestamps.textContent = `Updated ${formatRelativeTime(updated)} • Created ${formatRelativeTime(created)}`;

  card.appendChild(header);
  card.appendChild(title);
  card.appendChild(timestamps);

  return card;
}

/**
 * Get priority color
 */
function getPriorityColor(priority) {
  switch (priority) {
    case 1: return 'var(--danger)';   // High priority = red
    case 2: return 'var(--warning)';  // Medium priority = gold
    case 3: return 'var(--info)';     // Low priority = blue
    default: return 'var(--text-dim)';
  }
}

/**
 * Format relative time
 */
function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Render the beads list
 */
function renderBeadsList(container, beads) {
  if (!container) return;

  container.innerHTML = '';

  if (beads.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.cssText = 'text-align: center; padding: 40px 20px; color: var(--text-secondary);';
    empty.textContent = 'No beads found for this filter.';
    container.appendChild(empty);
    return;
  }

  beads.forEach(bead => {
    container.appendChild(createBeadCard(bead));
  });
}

/**
 * Render filter tabs
 */
function renderFilterTabs(container, counts, activeFilter) {
  if (!container) return;

  container.innerHTML = '';
  container.className = 'filter-tabs';
  container.style.cssText = 'display: flex; gap: 8px; margin-bottom: 16px; position: sticky; top: 0; background: var(--bg-deep); padding: 16px 0; z-index: 10;';

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'todo', label: 'Todo' },
    { key: 'active', label: 'Active' },
    { key: 'done', label: 'Done' },
    { key: 'failed', label: 'Failed' }
  ];

  filters.forEach(filter => {
    const tab = document.createElement('button');
    tab.className = 'filter-tab btn btn-ghost btn-sm';
    tab.textContent = `${filter.label} (${counts[filter.key]})`;
    tab.dataset.filter = filter.key;

    if (filter.key === activeFilter) {
      tab.classList.add('active');
      tab.style.borderBottom = '2px solid var(--gold)';
    }

    tab.addEventListener('click', () => handleFilterClick(filter.key));
    container.appendChild(tab);
  });
}

/**
 * Handle filter tab click
 */
async function handleFilterClick(status) {
  if (typeof window === 'undefined') return;

  window.beadsPageState.activeFilter = status;

  // Fetch filtered beads from API
  try {
    const queryParams = status !== 'all' ? `?status=${status}` : '';
    const beads = await api.get(`/beads${queryParams}`);
    window.beadsPageState.beads = beads;

    // Re-render
    const container = document.querySelector('.beads-list');
    const filterContainer = document.querySelector('.filter-bar');
    const counts = calculateCounts(beads);

    renderFilterTabs(filterContainer, counts, status);
    const sorted = sortBeads(beads, window.beadsPageState.sortBy);
    const filtered = filterBeads(sorted, status);
    renderBeadsList(container, filtered);
  } catch (error) {
    console.error('Failed to filter beads:', error);
  }
}

/**
 * Load and render beads data
 */
async function loadBeads() {
  if (typeof window === 'undefined') return;

  try {
    const beads = await api.get('/beads');
    window.beadsPageState.beads = beads;

    const counts = calculateCounts(beads);
    const filterContainer = document.querySelector('.filter-bar');
    renderFilterTabs(filterContainer, counts, window.beadsPageState.activeFilter);

    const sorted = sortBeads(beads, window.beadsPageState.sortBy);
    const filtered = filterBeads(sorted, window.beadsPageState.activeFilter);
    const container = document.querySelector('.beads-list');
    renderBeadsList(container, filtered);
  } catch (error) {
    console.error('Failed to load beads:', error);
    const container = document.querySelector('.beads-list');
    container.innerHTML = '<div class="error">Failed to load beads. Please try again.</div>';
  }
}

/**
 * Render the beads page
 */
export async function render() {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="container page-shell page-beads">
      <header class="page-header">
        <h1 class="page-title">Beads</h1>
        <p class="page-subtitle">Task queue, filtering, and triage.</p>
      </header>

      <div class="beads-layout">
        <div class="filter-bar"></div>
        <div class="beads-list">
          ${createLoadingSkeleton('card').outerHTML}
          ${createLoadingSkeleton('card').outerHTML}
          ${createLoadingSkeleton('card').outerHTML}
        </div>
      </div>
    </div>
  `;

  // Load data asynchronously
  await loadBeads();
}

/**
 * Mount function for lifecycle
 */
export function mount() {
  // Initialize state
  if (typeof window !== 'undefined') {
    window.beadsPageState = {
      beads: [],
      activeFilter: 'all',
      sortBy: 'updated'
    };
  }
}

/**
 * Unmount function for cleanup
 */
export function unmount() {
  // Clean up state
  if (typeof window !== 'undefined') {
    delete window.beadsPageState;
  }
}
