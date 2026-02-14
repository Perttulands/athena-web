/**
 * Portal Page
 * Container shell for Artifacts, Inbox, and Workspace tabs.
 */

import { createLoadingSkeleton } from '../components.js';
import * as artifactsPage from './artifacts.js';
import * as inboxPage from './inbox.js';
import * as scrollsPage from './scrolls.js';

const PORTAL_TABS = [
  { id: 'artifacts', label: 'Artifacts', page: artifactsPage },
  { id: 'inbox', label: 'Inbox', page: inboxPage },
  { id: 'workspace', label: 'Workspace', page: scrollsPage }
];

const TAB_BY_ID = Object.fromEntries(PORTAL_TABS.map((tab) => [tab.id, tab]));

function renderTabs(scope, activeTab) {
  const tabButtons = scope.querySelectorAll('.portal-tab');
  tabButtons.forEach((button) => {
    const isActive = button.dataset.portalTab === activeTab;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
    button.setAttribute('tabindex', isActive ? '0' : '-1');
  });
}

export function render() {
  const tabsHtml = PORTAL_TABS.map((tab, index) => `
    <button
      type="button"
      class="portal-tab${index === 0 ? ' active' : ''}"
      data-portal-tab="${tab.id}"
      role="tab"
      aria-selected="${index === 0 ? 'true' : 'false'}"
      tabindex="${index === 0 ? '0' : '-1'}"
      aria-controls="portal-tab-panel"
      id="portal-tab-${tab.id}"
    >
      ${tab.label}
    </button>
  `).join('');

  return `
    <div class="container page-shell page-portal">
      <header class="page-header">
        <h1 class="page-title">Portal</h1>
        <p class="page-subtitle">Artifacts, inbox, and workspace in one place.</p>
      </header>

      <section class="portal-layout card">
        <div class="portal-tabs" role="tablist" aria-label="Portal sections">
          ${tabsHtml}
        </div>
        <section
          id="portal-tab-panel"
          class="portal-tab-panel"
          role="tabpanel"
          aria-live="polite"
        >
          <div class="skeleton skeleton-card"></div>
        </section>
      </section>
    </div>
  `;
}

export async function mount(root) {
  const scope = root?.querySelector('.page-portal') || document.querySelector('.page-portal');
  if (!scope) return () => {};

  const panel = scope.querySelector('#portal-tab-panel');
  const tabList = scope.querySelector('.portal-tabs');
  if (!panel || !tabList) return () => {};

  let activeTab = 'artifacts';
  let activeUnmount = null;

  async function renderTab(tabId) {
    const nextTab = TAB_BY_ID[tabId];
    if (!nextTab) return;

    if (typeof activeUnmount === 'function') {
      activeUnmount();
      activeUnmount = null;
    }

    activeTab = tabId;
    renderTabs(scope, activeTab);

    panel.innerHTML = '';
    panel.appendChild(createLoadingSkeleton('card'));

    panel.innerHTML = nextTab.page.render();
    const tabUnmount = await nextTab.page.mount(panel);
    activeUnmount = typeof tabUnmount === 'function' ? tabUnmount : null;
  }

  async function onTabClick(event) {
    const button = event.target.closest('[data-portal-tab]');
    if (!button) return;

    const tabId = button.dataset.portalTab;
    if (!tabId || tabId === activeTab) return;

    await renderTab(tabId);
  }

  tabList.addEventListener('click', onTabClick);
  await renderTab(activeTab);

  return () => {
    tabList.removeEventListener('click', onTabClick);
    if (typeof activeUnmount === 'function') {
      activeUnmount();
      activeUnmount = null;
    }
  };
}
