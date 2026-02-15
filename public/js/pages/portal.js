/**
 * Portal Page
 * Unified container for Artifacts, Inbox, and Workspace tabs.
 */

import api from '../api.js';
import sse from '../sse.js';
import { renderMarkdown } from '../markdown.js';
import { createLoadingSkeleton, createToast } from '../components.js';
import * as inboxPage from './inbox.js';
import * as scrollsPage from './scrolls.js';

const ARTIFACT_SEARCH_LIMIT = 50;

function basename(filePath) {
  const chunks = String(filePath || '').split('/');
  return chunks[chunks.length - 1] || filePath;
}

function normalizeTree(tree) {
  if (!Array.isArray(tree)) return [];
  return [...tree].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'dir' ? -1 : 1;
    }
    return String(a.path).localeCompare(String(b.path));
  });
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseTableCells(line) {
  if (typeof line !== 'string' || !line.includes('|')) {
    return null;
  }

  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  const cells = normalized.split('|').map((cell) => cell.trim());

  if (cells.length === 0 || cells.every((cell) => cell.length === 0)) {
    return null;
  }

  return cells;
}

function isTableDividerLine(line) {
  const cells = parseTableCells(line);
  if (!cells || cells.length === 0) {
    return false;
  }

  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableStart(lines, index, inCodeBlock) {
  if (inCodeBlock) {
    return false;
  }

  const header = parseTableCells(lines[index]);
  const divider = lines[index + 1];

  if (!header || !divider) {
    return false;
  }

  return isTableDividerLine(divider);
}

function appendRenderedMarkdown(target, markdown) {
  const rendered = renderMarkdown(markdown);
  while (rendered.firstChild) {
    target.appendChild(rendered.firstChild);
  }
}

function appendMarkdownTable(target, headerCells, rows) {
  const wrapper = document.createElement('div');
  wrapper.className = 'portal-markdown-table-wrap';

  const table = document.createElement('table');
  table.className = 'portal-markdown-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerCells.forEach((cell) => {
    const th = document.createElement('th');
    th.textContent = cell;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((cells) => {
    const row = document.createElement('tr');
    cells.forEach((cell) => {
      const td = document.createElement('td');
      td.textContent = cell;
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  wrapper.appendChild(table);
  target.appendChild(wrapper);
}

function renderMarkdownWithTables(markdown) {
  const source = String(markdown || '');
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  const root = document.createElement('div');
  root.className = 'markdown-body';

  const markdownBuffer = [];
  let inCodeBlock = false;

  function flushMarkdownBuffer() {
    if (markdownBuffer.length === 0) {
      return;
    }

    appendRenderedMarkdown(root, markdownBuffer.join('\n'));
    markdownBuffer.length = 0;
  }

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }

    if (isTableStart(lines, index, inCodeBlock)) {
      const headerCells = parseTableCells(lines[index]) || [];
      const rows = [];
      flushMarkdownBuffer();

      index += 2;
      while (index < lines.length) {
        const rowCells = parseTableCells(lines[index]);
        if (!rowCells) {
          break;
        }
        rows.push(rowCells);
        index += 1;
      }

      appendMarkdownTable(root, headerCells, rows);
      continue;
    }

    markdownBuffer.push(line);
    index += 1;
  }

  flushMarkdownBuffer();

  return root;
}

function applyHeadingAnchors(root) {
  const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const usedIds = new Set();

  headings.forEach((heading) => {
    const headingText = String(heading.textContent || '').trim();
    if (!headingText) return;

    let baseId = slugify(headingText) || 'section';
    let finalId = baseId;
    let index = 2;

    while (usedIds.has(finalId)) {
      finalId = `${baseId}-${index}`;
      index += 1;
    }

    usedIds.add(finalId);
    heading.id = finalId;

    const anchor = document.createElement('a');
    anchor.className = 'portal-heading-anchor';
    anchor.href = `#${finalId}`;
    anchor.textContent = '#';
    anchor.setAttribute('aria-label', `Link to ${headingText}`);
    heading.appendChild(document.createTextNode(' '));
    heading.appendChild(anchor);
  });
}

function createArtifactTreeNode(entry, state) {
  if (entry.type === 'dir') {
    const details = document.createElement('details');
    details.className = 'portal-tree-dir';
    details.dataset.path = entry.path;
    details.open = state.openDirs.has(entry.path);

    const summary = document.createElement('summary');
    summary.textContent = basename(entry.path);
    summary.setAttribute('role', 'button');
    summary.setAttribute('aria-label', `Toggle directory ${basename(entry.path)}`);

    summary.addEventListener('click', () => {
      if (details.open) {
        state.openDirs.delete(entry.path);
      } else {
        state.openDirs.add(entry.path);
      }
    });

    details.appendChild(summary);

    const children = document.createElement('div');
    children.className = 'portal-tree-children';

    normalizeTree(entry.children).forEach((child) => {
      children.appendChild(createArtifactTreeNode(child, state));
    });

    details.appendChild(children);
    return details;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `portal-tree-file${state.currentPath === entry.path ? ' active' : ''}`;
  button.dataset.portalFilePath = entry.path;
  button.textContent = basename(entry.path);
  button.setAttribute('aria-label', `Open ${entry.path}`);
  return button;
}

function renderArtifactTree(scope, state) {
  const treeEl = scope.querySelector('#portal-artifacts-tree');
  if (!treeEl) return;

  treeEl.innerHTML = '';
  const items = normalizeTree(state.tree);

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No files found in this root.';
    treeEl.appendChild(empty);
    return;
  }

  items.forEach((entry) => {
    treeEl.appendChild(createArtifactTreeNode(entry, state));
  });
}

function renderArtifactDoc(scope, state) {
  const breadcrumb = scope.querySelector('#portal-artifacts-breadcrumb');
  const viewer = scope.querySelector('#portal-artifacts-viewer');
  if (!breadcrumb || !viewer) return;

  if (!state.currentPath) {
    breadcrumb.textContent = 'No document selected';
    viewer.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Select a file to view its content.';
    viewer.appendChild(empty);
    return;
  }

  breadcrumb.textContent = `${state.currentRoot} / ${state.currentPath}`;
  viewer.innerHTML = '';
  const markdown = renderMarkdownWithTables(state.currentContent);
  applyHeadingAnchors(markdown);
  viewer.appendChild(markdown);
}

function renderSearchResults(scope, state) {
  const list = scope.querySelector('#portal-artifacts-search-results');
  if (!list) return;

  list.innerHTML = '';

  if (state.searchState === 'idle') {
    const hint = document.createElement('div');
    hint.className = 'portal-search-hint';
    hint.textContent = 'Search this root to find files by content.';
    list.appendChild(hint);
    return;
  }

  if (state.searchState === 'loading') {
    list.appendChild(createLoadingSkeleton('text'));
    return;
  }

  if (state.searchResults.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No matching artifacts found.';
    list.appendChild(empty);
    return;
  }

  state.searchResults.forEach((result) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'portal-search-result';
    button.dataset.portalResultRoot = result.root;
    button.dataset.portalResultPath = result.path;
    button.setAttribute('aria-label', `Open ${result.path}`);
    button.innerHTML = `
      <div class="portal-search-result-path">${result.root} / ${result.path}</div>
      <div class="portal-search-result-snippet">line ${result.line}: ${result.snippet}</div>
    `;
    list.appendChild(button);
  });
}

function isTextEditingElement(target) {
  if (!target || typeof target !== 'object') {
    return false;
  }

  const element = target;
  const tagName = String(element.tagName || '').toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  return Boolean(element.isContentEditable);
}

const portalArtifactsTab = {
  render() {
    return `
      <section class="portal-artifacts">
        <header class="portal-artifacts-toolbar">
          <form id="portal-artifacts-search-form" class="portal-artifacts-search" role="search">
            <input
              id="portal-artifacts-search-input"
              class="portal-artifacts-search-input"
              type="search"
              placeholder="Search artifacts (/)"
              autocomplete="off"
              aria-label="Search artifacts"
            />
            <button type="submit" class="btn btn-primary btn-sm">Search</button>
          </form>
          <div id="portal-artifacts-search-results" class="portal-artifacts-search-results"></div>
        </header>

        <section class="portal-artifacts-layout">
          <aside id="portal-artifacts-sidebar" class="portal-artifacts-sidebar">
            <button
              type="button"
              id="portal-artifacts-tree-toggle"
              class="btn btn-ghost btn-sm portal-artifacts-tree-toggle"
              aria-expanded="false"
              aria-controls="portal-artifacts-tree-wrap"
            >
              Browse Files
            </button>

            <label class="portal-artifacts-root-label" for="portal-artifact-root">Root</label>
            <select id="portal-artifact-root" class="portal-artifacts-root-select" aria-label="Artifact root"></select>

            <div id="portal-artifacts-tree-wrap" class="portal-artifacts-tree-wrap">
              <div id="portal-artifacts-tree" class="portal-artifacts-tree" aria-label="Artifact file tree"></div>
            </div>
          </aside>

          <section class="portal-artifacts-content card">
            <header class="portal-artifacts-content-header">
              <div id="portal-artifacts-breadcrumb" class="portal-artifacts-breadcrumb">No document selected</div>
            </header>
            <div id="portal-artifacts-viewer" class="portal-artifacts-viewer" aria-live="polite">
              <div class="skeleton skeleton-card"></div>
            </div>
          </section>
        </section>
      </section>
    `;
  },

  async mount(root) {
    const scope = root?.querySelector('.portal-artifacts') || document.querySelector('.portal-artifacts');
    if (!scope) return () => {};

    const state = {
      roots: [],
      currentRoot: '',
      tree: [],
      currentPath: '',
      currentContent: '',
      openDirs: new Set(),
      searchResults: [],
      searchState: 'idle'
    };

    const rootSelect = scope.querySelector('#portal-artifact-root');
    const treeEl = scope.querySelector('#portal-artifacts-tree');
    const viewer = scope.querySelector('#portal-artifacts-viewer');
    const searchForm = scope.querySelector('#portal-artifacts-search-form');
    const searchInput = scope.querySelector('#portal-artifacts-search-input');
    const searchResultsEl = scope.querySelector('#portal-artifacts-search-results');
    const sidebar = scope.querySelector('#portal-artifacts-sidebar');
    const treeToggle = scope.querySelector('#portal-artifacts-tree-toggle');

    function setTreeLoading() {
      if (!treeEl) return;
      treeEl.innerHTML = '';
      treeEl.appendChild(createLoadingSkeleton('card'));
    }

    function setViewerLoading() {
      if (!viewer) return;
      viewer.innerHTML = '';
      viewer.appendChild(createLoadingSkeleton('card'));
    }

    function renderRoots() {
      if (!rootSelect) return;

      rootSelect.innerHTML = '';
      state.roots.forEach((rootOption) => {
        const option = document.createElement('option');
        option.value = rootOption.alias;
        option.textContent = rootOption.label || rootOption.alias;
        rootSelect.appendChild(option);
      });

      if (state.currentRoot) {
        rootSelect.value = state.currentRoot;
      }
    }

    async function loadTree() {
      if (!state.currentRoot) {
        state.tree = [];
        renderArtifactTree(scope, state);
        return;
      }

      setTreeLoading();
      try {
        const response = await api.get(
          `/artifacts/tree?root=${encodeURIComponent(state.currentRoot)}&path=`
        );
        state.tree = Array.isArray(response?.tree) ? response.tree : [];
        renderArtifactTree(scope, state);
      } catch (error) {
        state.tree = [];
        renderArtifactTree(scope, state);
        createToast({ type: 'error', message: error?.message || 'Failed to load artifact tree' });
      }
    }

    async function openDoc(path) {
      if (!path || !state.currentRoot) {
        return;
      }

      setViewerLoading();
      try {
        const response = await api.get(
          `/artifacts/doc?root=${encodeURIComponent(state.currentRoot)}&path=${encodeURIComponent(path)}`
        );

        state.currentPath = response?.path || path;
        state.currentContent = String(response?.content || '');
        renderArtifactTree(scope, state);
        renderArtifactDoc(scope, state);
      } catch (error) {
        createToast({ type: 'error', message: error?.message || 'Failed to load artifact document' });
      }
    }

    async function changeRoot(nextRoot) {
      if (!nextRoot) {
        return;
      }

      state.currentRoot = nextRoot;
      state.currentPath = '';
      state.currentContent = '';
      state.openDirs.clear();
      renderArtifactDoc(scope, state);
      await loadTree();
    }

    async function runSearch(query) {
      const trimmed = String(query || '').trim();
      if (!trimmed || !state.currentRoot) {
        state.searchResults = [];
        state.searchState = 'idle';
        renderSearchResults(scope, state);
        return;
      }

      state.searchState = 'loading';
      renderSearchResults(scope, state);

      try {
        const response = await api.get(
          `/artifacts/search?q=${encodeURIComponent(trimmed)}&roots=${encodeURIComponent(state.currentRoot)}&limit=${ARTIFACT_SEARCH_LIMIT}`
        );
        state.searchResults = Array.isArray(response?.results) ? response.results : [];
        state.searchState = 'done';
        renderSearchResults(scope, state);
      } catch (error) {
        state.searchResults = [];
        state.searchState = 'done';
        renderSearchResults(scope, state);
        createToast({ type: 'error', message: error?.message || 'Search failed' });
      }
    }

    async function openFromSearch(rootAlias, filePath) {
      if (!rootAlias || !filePath) return;

      if (rootAlias !== state.currentRoot) {
        await changeRoot(rootAlias);
        if (rootSelect) {
          rootSelect.value = rootAlias;
        }
      }

      await openDoc(filePath);
    }

    function onTreeClick(event) {
      const button = event.target.closest('[data-portal-file-path]');
      if (!button) return;
      void openDoc(button.dataset.portalFilePath);
    }

    function onRootChange(event) {
      const nextRoot = event.target?.value;
      void changeRoot(nextRoot);
    }

    function onSearchSubmit(event) {
      event.preventDefault();
      void runSearch(searchInput?.value || '');
    }

    function onSearchResultClick(event) {
      const button = event.target.closest('[data-portal-result-path]');
      if (!button) return;

      const rootAlias = button.dataset.portalResultRoot || state.currentRoot;
      const filePath = button.dataset.portalResultPath || '';
      void openFromSearch(rootAlias, filePath);
    }

    function onTreeToggle() {
      if (!sidebar || !treeToggle) return;
      sidebar.classList.toggle('open');
      const expanded = sidebar.classList.contains('open');
      treeToggle.setAttribute('aria-expanded', String(expanded));
    }

    function clearSearch() {
      if (searchInput) {
        searchInput.value = '';
      }
      state.searchResults = [];
      state.searchState = 'idle';
      renderSearchResults(scope, state);
    }

    function onGlobalKeydown(event) {
      if (!searchInput) return;

      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (isTextEditingElement(event.target)) {
          return;
        }
        event.preventDefault();
        searchInput.focus();
        searchInput.select();
        return;
      }

      if (event.key === 'Escape') {
        const shouldClear = searchInput.value.length > 0 || state.searchState !== 'idle';
        if (!shouldClear) {
          return;
        }

        event.preventDefault();
        clearSearch();
      }
    }

    function onArtifactUpdate(data) {
      if (!data) return;
      // Refresh tree if the update affects the currently viewed root
      if (data.root === state.currentRoot || data.source === 'artifact') {
        api.clearCache();
        void loadTree();
        // Re-load current doc if its file changed
        if (state.currentPath && data.file && data.file.includes(state.currentPath)) {
          void openDoc(state.currentPath);
        }
      }
      // Flash highlight on sidebar
      if (sidebar) {
        sidebar.classList.add('sse-flash');
        setTimeout(() => sidebar.classList.remove('sse-flash'), 600);
      }
    }

    treeEl?.addEventListener('click', onTreeClick);
    rootSelect?.addEventListener('change', onRootChange);
    searchForm?.addEventListener('submit', onSearchSubmit);
    searchResultsEl?.addEventListener('click', onSearchResultClick);
    treeToggle?.addEventListener('click', onTreeToggle);
    document.addEventListener('keydown', onGlobalKeydown);
    sse?.on('artifact_update', onArtifactUpdate);

    renderArtifactDoc(scope, state);
    renderSearchResults(scope, state);

    try {
      const rootResponse = await api.get('/artifacts/roots');
      state.roots = Array.isArray(rootResponse?.roots) ? rootResponse.roots : [];
      state.currentRoot = state.roots[0]?.alias || '';
      renderRoots();
      await loadTree();
    } catch (error) {
      createToast({ type: 'error', message: error?.message || 'Failed to load artifact roots' });
      renderRoots();
      renderArtifactTree(scope, state);
    }

    return () => {
      treeEl?.removeEventListener('click', onTreeClick);
      rootSelect?.removeEventListener('change', onRootChange);
      searchForm?.removeEventListener('submit', onSearchSubmit);
      searchResultsEl?.removeEventListener('click', onSearchResultClick);
      treeToggle?.removeEventListener('click', onTreeToggle);
      document.removeEventListener('keydown', onGlobalKeydown);
      sse?.off('artifact_update', onArtifactUpdate);
    };
  }
};

const PORTAL_TABS = [
  { id: 'artifacts', label: 'Artifacts', page: portalArtifactsTab },
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

  function onInboxUpdate() {
    if (activeTab !== 'inbox') return;
    // Re-render the inbox tab to pick up new items
    api.clearCache();
    void renderTab('inbox');
  }

  tabList.addEventListener('click', onTabClick);
  sse?.on('inbox_update', onInboxUpdate);
  await renderTab(activeTab);

  return () => {
    tabList.removeEventListener('click', onTabClick);
    sse?.off('inbox_update', onInboxUpdate);
    if (typeof activeUnmount === 'function') {
      activeUnmount();
      activeUnmount = null;
    }
  };
}
