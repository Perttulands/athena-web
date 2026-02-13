/**
 * Athena UI component factories
 * All factories return DOM elements (no HTML string injection).
 */

const BADGE_CLASS_BY_STATUS = {
  running: 'badge-running',
  stopped: 'badge-todo',
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

function getFocusableElements(scope) {
  if (!scope) return [];
  return Array.from(scope.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ));
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
  if (!dialog) return;
  dialog.remove();
}

export function createConfirmDialog({ title, message, onConfirm } = {}) {
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog-overlay';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1;

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
  cancelButton.setAttribute('aria-label', 'Cancel confirmation');
  cancelButton.addEventListener('click', () => closeDialog(dialog));

  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className = 'btn btn-danger';
  confirmButton.textContent = 'Confirm';
  confirmButton.setAttribute('aria-label', 'Confirm action');
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

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog(dialog);
    }
  });

  setTimeout(() => {
    cancelButton.focus();
  }, 0);

  return dialog;
}

export function createBottomSheet({
  title = '',
  content = null,
  closeOnBackdrop = true,
  showCloseButton = true,
  className = '',
  onClose = null,
  labelledBy = null
} = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'bottom-sheet-overlay';

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'bottom-sheet-backdrop';
  backdrop.setAttribute('aria-label', 'Close panel');

  const panel = document.createElement('section');
  panel.className = `bottom-sheet ${className}`.trim();
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.tabIndex = -1;

  const handle = document.createElement('div');
  handle.className = 'bottom-sheet-handle';
  handle.setAttribute('aria-hidden', 'true');
  panel.appendChild(handle);

  const header = document.createElement('header');
  header.className = 'bottom-sheet-header';

  const heading = document.createElement('h2');
  heading.className = 'bottom-sheet-title';
  heading.textContent = String(title || 'Details');

  const headingId = labelledBy || `sheet-title-${Math.random().toString(36).slice(2, 8)}`;
  heading.id = headingId;
  panel.setAttribute('aria-labelledby', headingId);

  header.appendChild(heading);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn btn-ghost btn-sm bottom-sheet-close';
  closeButton.textContent = 'Close';
  closeButton.setAttribute('aria-label', 'Close panel');

  if (showCloseButton) {
    header.appendChild(closeButton);
  }

  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'bottom-sheet-body';
  panel.appendChild(body);

  function setContent(nextContent) {
    body.innerHTML = '';
    appendContent(body, nextContent);
  }

  setContent(content);

  overlay.append(backdrop, panel);

  let isOpen = false;
  let activeElement = null;
  let touchStartY = 0;
  let touchCurrentY = 0;

  function lockBodyScroll(lock) {
    if (!document?.body) return;
    if (lock) {
      document.body.classList.add('sheet-open');
    } else {
      document.body.classList.remove('sheet-open');
    }
  }

  function focusFirst() {
    const focusables = getFocusableElements(panel);
    if (focusables.length > 0) {
      focusables[0].focus();
      return;
    }
    panel.focus();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusables = getFocusableElements(panel);
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onTouchStart(event) {
    touchStartY = event.touches?.[0]?.clientY || 0;
    touchCurrentY = touchStartY;
  }

  function onTouchMove(event) {
    touchCurrentY = event.touches?.[0]?.clientY || touchCurrentY;
    const delta = Math.max(0, touchCurrentY - touchStartY);
    if (delta > 0) {
      panel.style.transform = `translateY(${Math.min(delta, 140)}px)`;
    }
  }

  function onTouchEnd() {
    const delta = touchCurrentY - touchStartY;
    panel.style.transform = '';
    if (delta > 80) {
      close();
    }
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    activeElement = document.activeElement;

    document.body.appendChild(overlay);
    const scheduleFrame = typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) => setTimeout(callback, 0);
    scheduleFrame(() => {
      overlay.classList.add('open');
    });

    lockBodyScroll(true);
    panel.addEventListener('keydown', onKeyDown);
    panel.addEventListener('touchstart', onTouchStart, { passive: true });
    panel.addEventListener('touchmove', onTouchMove, { passive: true });
    panel.addEventListener('touchend', onTouchEnd, { passive: true });

    setTimeout(() => {
      focusFirst();
    }, 30);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;

    overlay.classList.remove('open');
    panel.removeEventListener('keydown', onKeyDown);
    panel.removeEventListener('touchstart', onTouchStart);
    panel.removeEventListener('touchmove', onTouchMove);
    panel.removeEventListener('touchend', onTouchEnd);

    lockBodyScroll(false);

    setTimeout(() => {
      overlay.remove();
      if (activeElement && typeof activeElement.focus === 'function') {
        activeElement.focus();
      }
      if (typeof onClose === 'function') {
        onClose();
      }
    }, 220);
  }

  if (closeOnBackdrop) {
    backdrop.addEventListener('click', close);
  }

  closeButton.addEventListener('click', close);

  return {
    element: overlay,
    panel,
    body,
    open,
    close,
    setContent,
    setTitle(nextTitle) {
      heading.textContent = String(nextTitle || 'Details');
    },
    isOpen() {
      return isOpen;
    }
  };
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
  createBottomSheet,
  createToast
};
