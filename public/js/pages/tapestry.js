/**
 * Tapestry Page
 * Beads colored by status, sized by priority, grouped into swim lanes.
 * Mobile-optimized with stacked layout on small screens.
 */

import api from '../api.js';
import { createBadge, createToast } from '../components.js';

const SIZE_CLASS = { lg: 'tapestry-node-lg', md: 'tapestry-node-md', sm: 'tapestry-node-sm' };

function createNode(node) {
  const el = document.createElement('button');
  el.className = `tapestry-node ${SIZE_CLASS[node.size] || 'tapestry-node-sm'}`;
  el.style.setProperty('--node-color', node.color);
  el.setAttribute('aria-label', `${node.title || node.id} - ${node.canonicalStatus}`);
  el.setAttribute('title', `${node.id}: ${node.title || 'Untitled'}`);

  const idEl = document.createElement('span');
  idEl.className = 'tapestry-node-id';
  idEl.textContent = node.id || '?';

  const titleEl = document.createElement('span');
  titleEl.className = 'tapestry-node-title';
  titleEl.textContent = node.title || 'Untitled';

  el.append(idEl, titleEl);

  if (node.assignee) {
    const assignee = document.createElement('span');
    assignee.className = 'tapestry-node-assignee';
    assignee.textContent = node.assignee;
    el.appendChild(assignee);
  }

  return el;
}

function createLane(label, nodes, color) {
  const lane = document.createElement('section');
  lane.className = 'tapestry-lane';

  const header = document.createElement('header');
  header.className = 'tapestry-lane-header';

  const title = document.createElement('h3');
  title.className = 'tapestry-lane-title';
  title.style.color = color;
  title.textContent = `${label} (${nodes.length})`;

  header.appendChild(title);
  lane.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'tapestry-lane-grid';

  if (nodes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = `No ${label.toLowerCase()} beads.`;
    grid.appendChild(empty);
  } else {
    nodes.forEach((n) => grid.appendChild(createNode(n)));
  }

  lane.appendChild(grid);
  return lane;
}

function renderTapestry(scope, data) {
  const container = scope.querySelector('#tapestry-content');
  if (!container) return;
  container.innerHTML = '';

  // Summary bar
  const summary = document.createElement('div');
  summary.className = 'tapestry-summary';
  const statusColors = data.statusColors || {};
  const labels = [
    ['Todo', data.summary?.todo, statusColors.todo],
    ['Active', data.summary?.active, statusColors.active],
    ['Done', data.summary?.done, statusColors.done],
    ['Failed', data.summary?.failed, statusColors.failed]
  ];
  labels.forEach(([label, count, color]) => {
    const pill = document.createElement('span');
    pill.className = 'tapestry-summary-pill';
    pill.style.borderColor = color || 'var(--text-dim)';
    pill.textContent = `${label}: ${count ?? 0}`;
    summary.appendChild(pill);
  });
  container.appendChild(summary);

  // Lanes
  const lanes = document.createElement('div');
  lanes.className = 'tapestry-lanes';

  const groups = data.groups || {};
  lanes.appendChild(createLane('Active', groups.active || [], statusColors.active));
  lanes.appendChild(createLane('Todo', groups.todo || [], statusColors.todo));
  lanes.appendChild(createLane('Done', groups.done || [], statusColors.done));
  lanes.appendChild(createLane('Failed', groups.failed || [], statusColors.failed));

  container.appendChild(lanes);
}

export function render() {
  return `
    <div class="container page-shell page-tapestry">
      <header class="page-header">
        <h1 class="page-title">Tapestry</h1>
        <p class="page-subtitle">All beads, colored by status, sized by priority.</p>
      </header>
      <section id="tapestry-content" aria-live="polite">
        <div class="skeleton skeleton-card"></div>
      </section>
    </div>
  `;
}

export async function mount(root) {
  const scope = root?.querySelector('.page-tapestry') || document.querySelector('.page-tapestry');
  if (!scope) return () => {};

  try {
    const data = await api.get('/tapestry');
    renderTapestry(scope, data);
  } catch (error) {
    const container = scope.querySelector('#tapestry-content');
    if (container) container.innerHTML = '<div class="empty-state">Failed to load tapestry data.</div>';
    createToast({ type: 'error', message: error?.message || 'Tapestry unavailable' });
  }

  return () => {};
}
