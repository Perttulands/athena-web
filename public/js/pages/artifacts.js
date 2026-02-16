/**
 * Artifacts Page
 * Browse agent run artifacts from state/results JSON files.
 */

import api from '../api.js';
import { renderMarkdown } from '../markdown.js';
import { createLoadingSkeleton, createToast } from '../components.js';

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return 'n/a';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return String(value);
  }
  return new Date(parsed).toLocaleString();
}

function statusBadgeClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'done' || normalized === 'success') return 'badge-done';
  if (normalized === 'failed' || normalized === 'error') return 'badge-failed';
  if (normalized === 'running') return 'badge-running';
  return 'badge-active';
}

function parseCodeLanguage(codeElement) {
  const fromDataset = String(codeElement.dataset.language || '').trim().toLowerCase();
  if (fromDataset) {
    return fromDataset;
  }

  const className = String(codeElement.className || '');
  const match = className.match(/language-([a-zA-Z0-9_+-]+)/);
  if (match) {
    return match[1].toLowerCase();
  }

  return '';
}

function highlightDiff(text) {
  return text
    .split('\n')
    .map((line) => {
      const escaped = escapeHtml(line);
      if (line.startsWith('+')) {
        return `<span class="code-token-add">${escaped}</span>`;
      }
      if (line.startsWith('-')) {
        return `<span class="code-token-del">${escaped}</span>`;
      }
      if (line.startsWith('@@')) {
        return `<span class="code-token-keyword">${escaped}</span>`;
      }
      return escaped;
    })
    .join('\n');
}

function highlightStructured(text) {
  let html = escapeHtml(text);

  html = html.replace(/&quot;(?:\\.|[^&]|&(?!quot;))*?&quot;/g, (match) => (
    `<span class="code-token-string">${match}</span>`
  ));

  html = html.replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="code-token-number">$1</span>');

  html = html.replace(/\b(true|false|null|undefined|const|let|var|function|return|if|else|for|while|import|from|export|class|await|async|try|catch|finally|new)\b/g, '<span class="code-token-keyword">$1</span>');

  return html;
}

function highlightShell(text) {
  return text
    .split('\n')
    .map((line) => {
      const escaped = escapeHtml(line);
      if (line.trim().startsWith('#')) {
        return `<span class="code-token-comment">${escaped}</span>`;
      }
      if (line.trim().startsWith('$')) {
        return `<span class="code-token-keyword">${escaped}</span>`;
      }
      return escaped;
    })
    .join('\n');
}

function highlightCode(text, language) {
  const lang = String(language || '').toLowerCase();

  if (lang === 'diff' || lang === 'patch') {
    return highlightDiff(text);
  }

  if (lang === 'bash' || lang === 'sh' || lang === 'shell' || lang === 'zsh') {
    return highlightShell(text);
  }

  if (lang === 'json' || lang === 'js' || lang === 'javascript' || lang === 'ts' || lang === 'typescript') {
    return highlightStructured(text);
  }

  return escapeHtml(text);
}

function applySyntaxHighlighting(scope) {
  if (!scope) return;

  const codeBlocks = scope.querySelectorAll('pre > code');
  codeBlocks.forEach((code) => {
    const language = parseCodeLanguage(code);
    const highlighted = highlightCode(code.textContent || '', language);
    code.innerHTML = highlighted;
    code.classList.add('code-highlighted');
  });
}

function renderArtifactList(scope, state) {
  const list = scope.querySelector('#artifacts-list');
  if (!list) return;

  list.innerHTML = '';

  if (state.loadingList) {
    list.appendChild(createLoadingSkeleton('card'));
    list.appendChild(createLoadingSkeleton('card'));
    return;
  }

  if (!Array.isArray(state.artifacts) || state.artifacts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No artifact result JSON files were found.';
    list.appendChild(empty);
    return;
  }

  const group = document.createElement('section');
  group.className = 'artifacts-category';

  const title = document.createElement('h2');
  title.className = 'artifacts-category-title';
  title.textContent = 'Agent Work Products';
  group.appendChild(title);

  state.artifacts.forEach((artifact) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `artifact-item${artifact.id === state.currentId ? ' active' : ''}`;
    button.dataset.artifactId = artifact.id;

    const head = document.createElement('div');
    head.className = 'artifact-item-head';

    const itemTitle = document.createElement('strong');
    itemTitle.className = 'artifact-item-title';
    itemTitle.textContent = artifact.title || artifact.id;

    const badge = document.createElement('span');
    badge.className = `badge ${statusBadgeClass(artifact.status)}`;
    badge.textContent = artifact.status || 'unknown';

    head.append(itemTitle, badge);

    const meta = document.createElement('div');
    meta.className = 'artifact-item-meta';
    const agent = artifact.agent || 'agent';
    const finished = formatDate(artifact.finishedAt || artifact.updatedAt);
    meta.textContent = `${agent} • ${finished}`;

    button.append(head, meta);

    if (artifact.summaryPreview) {
      const summary = document.createElement('div');
      summary.className = 'artifact-item-summary';
      summary.textContent = artifact.summaryPreview;
      button.appendChild(summary);
    }

    group.appendChild(button);
  });

  list.appendChild(group);
}

function renderArtifactDetail(scope, state) {
  const breadcrumb = scope.querySelector('#artifacts-breadcrumb');
  const metadata = scope.querySelector('#artifacts-meta');
  const viewer = scope.querySelector('#artifacts-viewer');
  const backBtn = scope.querySelector('#artifacts-back-btn');
  if (!breadcrumb || !metadata || !viewer || !backBtn) return;

  viewer.innerHTML = '';
  metadata.innerHTML = '';

  if (state.loadingDetail) {
    breadcrumb.textContent = 'Loading artifact…';
    viewer.appendChild(createLoadingSkeleton('text'));
    viewer.appendChild(createLoadingSkeleton('text'));
    backBtn.hidden = false;
    return;
  }

  if (!state.currentArtifact || !state.currentArtifact.markdown) {
    breadcrumb.textContent = 'Select an artifact';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Choose an artifact to inspect code diffs, test results, and logs.';
    viewer.appendChild(empty);
    backBtn.hidden = true;
    return;
  }

  const { artifact, markdown } = state.currentArtifact;
  breadcrumb.textContent = `${artifact.title || artifact.id} (${artifact.id})`;

  const metaRows = [
    ['Status', artifact.status || 'unknown'],
    ['Agent', artifact.agent || 'unknown'],
    ['Bead', artifact.bead || 'n/a'],
    ['Started', formatDate(artifact.startedAt)],
    ['Finished', formatDate(artifact.finishedAt || artifact.updatedAt)],
    ['Exit code', artifact.exitCode ?? 'n/a']
  ];

  metaRows.forEach(([label, value]) => {
    const row = document.createElement('span');
    row.className = 'artifact-meta-pill';
    row.textContent = `${label}: ${value}`;
    metadata.appendChild(row);
  });

  const markdownRoot = renderMarkdown(markdown);
  applySyntaxHighlighting(markdownRoot);
  viewer.appendChild(markdownRoot);
  backBtn.hidden = false;
}

function resolveInitialArtifactId(routeContext) {
  const routeId = routeContext?.params?.id;
  if (!routeId) {
    return '';
  }
  return String(routeId).trim();
}

export function render() {
  return `
    <div class="container page-shell page-artifacts">
      <header class="page-header">
        <h1 class="page-title">Artifacts</h1>
        <p class="page-subtitle">Agent work products from <code>state/results/*.json</code>.</p>
      </header>

      <section class="artifacts-layout">
        <aside class="artifacts-sidebar card">
          <h2 class="artifacts-sidebar-title">Result Files</h2>
          <div id="artifacts-list" class="artifacts-list" aria-live="polite"></div>
        </aside>

        <section class="artifacts-content card" aria-live="polite">
          <header class="artifacts-content-header">
            <div class="artifacts-breadcrumb-row">
              <button id="artifacts-back-btn" class="btn btn-ghost btn-sm" type="button" hidden>Back</button>
              <div id="artifacts-breadcrumb" class="artifacts-breadcrumb">Select an artifact</div>
            </div>
            <div id="artifacts-meta" class="artifacts-meta" aria-label="Artifact metadata"></div>
          </header>

          <div id="artifacts-viewer" class="artifacts-viewer">
            <div class="empty-state">Choose an artifact to inspect code diffs, test results, and logs.</div>
          </div>
        </section>
      </section>
    </div>
  `;
}

export async function mount(root, routeContext = {}) {
  const scope = root?.querySelector('.page-artifacts') || document.querySelector('.page-artifacts');
  if (!scope) return () => {};

  const state = {
    artifacts: [],
    loadingList: true,
    loadingDetail: false,
    currentId: resolveInitialArtifactId(routeContext),
    currentArtifact: null
  };

  const listEl = scope.querySelector('#artifacts-list');
  const backBtn = scope.querySelector('#artifacts-back-btn');

  async function fetchArtifacts() {
    state.loadingList = true;
    renderArtifactList(scope, state);

    try {
      const response = await api.get('/artifacts/results');
      state.artifacts = Array.isArray(response?.artifacts) ? response.artifacts : [];
      state.loadingList = false;
      renderArtifactList(scope, state);

      if (state.currentId) {
        const exists = state.artifacts.some((item) => item.id === state.currentId);
        if (exists) {
          await fetchArtifactById(state.currentId, false);
        } else {
          state.currentId = '';
          renderArtifactDetail(scope, state);
          createToast({ type: 'error', message: 'Artifact id not found' });
        }
      }
    } catch (error) {
      state.loadingList = false;
      renderArtifactList(scope, state);
      createToast({ type: 'error', message: error?.message || 'Failed to load artifacts' });
    }
  }

  async function fetchArtifactById(id, updateHash = true) {
    if (!id) {
      state.currentId = '';
      state.currentArtifact = null;
      renderArtifactList(scope, state);
      renderArtifactDetail(scope, state);
      return;
    }

    state.currentId = String(id);
    state.loadingDetail = true;
    renderArtifactList(scope, state);
    renderArtifactDetail(scope, state);

    try {
      const encodedId = encodeURIComponent(state.currentId);
      const response = await api.get(`/artifacts/results/${encodedId}`);
      state.currentArtifact = response;
      state.loadingDetail = false;
      renderArtifactList(scope, state);
      renderArtifactDetail(scope, state);

      if (updateHash && typeof window !== 'undefined') {
        const expectedHash = `#/artifacts/${encodedId}`;
        if (window.location.hash !== expectedHash) {
          window.location.hash = expectedHash;
        }
      }
    } catch (error) {
      state.loadingDetail = false;
      state.currentArtifact = null;
      renderArtifactDetail(scope, state);
      createToast({ type: 'error', message: error?.message || 'Failed to load artifact detail' });
    }
  }

  function onListClick(event) {
    const button = event.target.closest('[data-artifact-id]');
    if (!button) {
      return;
    }

    const artifactId = button.dataset.artifactId;
    if (!artifactId) {
      return;
    }

    fetchArtifactById(artifactId, true);
  }

  function onBackClick() {
    state.currentId = '';
    state.currentArtifact = null;
    renderArtifactList(scope, state);
    renderArtifactDetail(scope, state);

    if (typeof window !== 'undefined' && window.location.hash !== '#/artifacts') {
      window.location.hash = '#/artifacts';
    }
  }

  listEl?.addEventListener('click', onListClick);
  backBtn?.addEventListener('click', onBackClick);

  await fetchArtifacts();

  return () => {
    listEl?.removeEventListener('click', onListClick);
    backBtn?.removeEventListener('click', onBackClick);
  };
}
