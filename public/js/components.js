/**
 * Athena UI component factories
 * All factories return DOM elements (no HTML string injection).
 */

const BADGE_CLASS_BY_STATUS = {
  running: 'badge-running',
  done: 'badge-done',
  failed: 'badge-failed',
  todo: 'badge-todo',
  active: 'badge-active',
  success: 'badge-done',
  error: 'badge-failed',
  warning: 'badge-active'
};

function toStatusLabel(status) {
  if (!status) return 'Unknown';
  return String(status).replace(/[_-]/g, ' ').trim() || 'Unknown';
}

function appendContent(container, content) {
  if (content === null || content === undefined) return;
  if (typeof Node !== 'undefined' && content instanceof Node) {
    container.appendChild(content);
    return;
  }
  container.textContent = String(content);
}

export function createBadge(status) {
  const badge = document.createElement('span');
  badge.className = 'badge';

  const normalizedStatus = String(status || 'todo').toLowerCase();
  const statusClass = BADGE_CLASS_BY_STATUS[normalizedStatus] || 'badge-todo';
  badge.classList.add(statusClass);
  badge.textContent = toStatusLabel(normalizedStatus);
  return badge;
}

export function createCard({ title, body, status, footer } = {}) {
  const card = document.createElement('article');
  card.className = 'card';

  if (title || status) {
    const header = document.createElement('header');
    header.className = 'card-header';

    if (title) {
      const heading = document.createElement('h3');
      heading.className = 'card-title';
      heading.textContent = String(title);
      header.appendChild(heading);
    }

    if (status) {
      header.appendChild(createBadge(status));
    }

    card.appendChild(header);
  }

  const bodyEl = document.createElement('div');
  bodyEl.className = 'card-body';
  appendContent(bodyEl, body);
  card.appendChild(bodyEl);

  if (footer !== null && footer !== undefined) {
    const footerEl = document.createElement('footer');
    footerEl.className = 'card-footer';
    appendContent(footerEl, footer);
    card.appendChild(footerEl);
  }

  return card;
}

function activityTypeIcon(type) {
  switch (type) {
    case 'agent_complete':
      return '✓';
    case 'agent_failed':
      return '✗';
    case 'bead_created':
      return '◉';
    case 'ralph_step':
      return '↻';
    default:
      return '•';
  }
}

export function createActivityItem({ time, type, message } = {}) {
  const item = document.createElement('li');
  item.className = `list-item activity-item activity-${type || 'default'}`;

  const icon = document.createElement('span');
  icon.className = 'activity-icon';
  icon.textContent = activityTypeIcon(type);
  item.appendChild(icon);

  const content = document.createElement('div');
  content.className = 'list-item-content';

  const messageEl = document.createElement('div');
  messageEl.className = 'activity-message';
  messageEl.textContent = String(message || 'No activity message');
  content.appendChild(messageEl);

  const meta = document.createElement('div');
  meta.className = 'list-item-meta';

  const timeEl = document.createElement('span');
  timeEl.className = 'timestamp';
  timeEl.textContent = String(time || '');
  meta.appendChild(timeEl);

  const typeBadge = createBadge(typeToBadgeStatus(type));
  meta.appendChild(typeBadge);

  content.appendChild(meta);
  item.appendChild(content);

  return item;
}

function typeToBadgeStatus(type) {
  switch (type) {
    case 'agent_complete':
      return 'done';
    case 'agent_failed':
      return 'failed';
    case 'bead_created':
      return 'active';
    case 'ralph_step':
      return 'running';
    default:
      return 'todo';
  }
}

export function createStatBox({ label, value, trend } = {}) {
  const box = document.createElement('section');
  box.className = 'stat-box card card-compact';

  const valueEl = document.createElement('div');
  valueEl.className = 'stat-value';
  valueEl.textContent = String(value ?? '0');
  box.appendChild(valueEl);

  const labelEl = document.createElement('div');
  labelEl.className = 'stat-label';
  labelEl.textContent = String(label || 'Metric');
  box.appendChild(labelEl);

  if (trend) {
    const trendEl = document.createElement('div');
    trendEl.className = `stat-trend trend-${String(trend).toLowerCase()}`;
    trendEl.textContent = String(trend);
    box.appendChild(trendEl);
  }

  return box;
}

export function createLoadingSkeleton(type = 'card') {
  const skeleton = document.createElement('div');
  skeleton.classList.add('skeleton');

  switch (type) {
    case 'text':
      skeleton.classList.add('skeleton-text');
      break;
    case 'title':
      skeleton.classList.add('skeleton-title');
      break;
    case 'avatar':
      skeleton.classList.add('skeleton-avatar');
      break;
    case 'card':
    default:
      skeleton.classList.add('skeleton-card');
      break;
  }

  return skeleton;
}

function closeDialog(dialog) {
  dialog.remove();
}

export function createConfirmDialog({ title, message, onConfirm } = {}) {
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog-overlay';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  const panel = document.createElement('div');
  panel.className = 'confirm-dialog card';

  const heading = document.createElement('h3');
  heading.className = 'card-title';
  heading.textContent = String(title || 'Confirm action');
  panel.appendChild(heading);

  const body = document.createElement('p');
  body.className = 'confirm-dialog-message';
  body.textContent = String(message || '');
  panel.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'confirm-dialog-actions';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn btn-ghost';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => closeDialog(dialog));

  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className = 'btn btn-danger';
  confirmButton.textContent = 'Confirm';
  confirmButton.addEventListener('click', () => {
    if (typeof onConfirm === 'function') {
      onConfirm();
    }
    closeDialog(dialog);
  });

  actions.append(cancelButton, confirmButton);
  panel.appendChild(actions);
  dialog.appendChild(panel);

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      closeDialog(dialog);
    }
  });

  return dialog;
}

function getOrCreateToastContainer() {
  let container = document.querySelector('#toast-container');
  if (container) return container;

  container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

export function createToast({ message, type = 'info', duration = 3000 } = {}) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${String(type).toLowerCase()}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = String(message || '');

  const container = getOrCreateToastContainer();
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, duration);

  return toast;
}

export default {
  createCard,
  createBadge,
  createActivityItem,
  createStatBox,
  createLoadingSkeleton,
  createConfirmDialog,
  createToast
};
