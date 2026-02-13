/**
 * Artifacts Page
 * Browse and view markdown artifacts from various sources.
 */

import api from '../api.js';
import { renderMarkdown } from '../markdown.js';
import { createLoadingSkeleton, createToast } from '../components.js';

function groupByCategory(artifacts) {
  const grouped = {};

  artifacts.forEach((artifact) => {
    const category = artifact.category || 'Other';
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(artifact);
  });

  return grouped;
}

function renderArtifactsList(scope, state) {
  const listEl = scope.querySelector('#artifacts-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (state.artifacts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No artifacts found.';
    listEl.appendChild(empty);
    return;
  }

  const grouped = groupByCategory(state.artifacts);

  Object.keys(grouped).sort().forEach((category) => {
    const section = document.createElement('div');
    section.className = 'artifacts-category';

    const heading = document.createElement('h3');
    heading.className = 'artifacts-category-title';
    heading.textContent = category;
    section.appendChild(heading);

    const items = grouped[category].sort((a, b) => a.name.localeCompare(b.name));

    items.forEach((artifact) => {
      if (!artifact?.encodedPath) {
        return;
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'artifact-item';
      button.dataset.encodedPath = artifact.encodedPath;
      button.textContent = artifact.basename || artifact.name || 'Untitled artifact';
      button.setAttribute('aria-label', `View ${artifact.name || artifact.basename || 'artifact'}`);
      section.appendChild(button);
    });

    listEl.appendChild(section);
  });
}

function renderViewer(scope, state) {
  const viewer = scope.querySelector('#artifacts-viewer');
  const breadcrumb = scope.querySelector('#artifacts-breadcrumb');
  const backBtn = scope.querySelector('#artifacts-back-btn');

  if (!viewer || !breadcrumb) return;

  if (!state.currentArtifact) {
    if (backBtn) backBtn.style.display = 'none';
    breadcrumb.textContent = 'Select an artifact to view';
    viewer.innerHTML = '';

    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Select an artifact from the list to begin.';
    viewer.appendChild(empty);
    return;
  }

  if (backBtn) backBtn.style.display = 'inline-flex';
  breadcrumb.textContent = state.currentArtifact.name;

  viewer.innerHTML = '';
  viewer.appendChild(renderMarkdown(state.currentContent));
}

export function render() {
  return `
    <div class="container page-shell page-artifacts">
      <header class="page-header">
        <h1 class="page-title">Artifacts</h1>
        <p class="page-subtitle">Browse research, reviews, and documentation.</p>
      </header>

      <section class="artifacts-layout">
        <aside class="artifacts-sidebar card">
          <h2 class="artifacts-sidebar-title">Available Artifacts</h2>
          <div id="artifacts-list" class="artifacts-list" aria-label="Artifacts list"></div>
        </aside>

        <section class="artifacts-content card">
          <header class="artifacts-content-header">
            <div class="artifacts-breadcrumb-row">
              <button type="button" id="artifacts-back-btn" class="btn btn-ghost btn-sm" aria-label="Back to list" style="display: none;">
                ← Back
              </button>
              <div id="artifacts-breadcrumb" class="artifacts-breadcrumb">Select an artifact to view</div>
            </div>
          </header>
          <div id="artifacts-viewer" class="artifacts-viewer" aria-live="polite">
            <div class="skeleton skeleton-card"></div>
          </div>
        </section>
      </section>
    </div>
  `;
}

export async function mount(root) {
  const scope = root?.querySelector('.page-artifacts') || document.querySelector('.page-artifacts');
  if (!scope) return () => {};

  const state = {
    artifacts: [],
    currentArtifact: null,
    currentContent: ''
  };

  const listEl = scope.querySelector('#artifacts-list');
  const backBtn = scope.querySelector('#artifacts-back-btn');

  async function viewArtifact(artifact) {
    state.currentArtifact = artifact;
    state.currentContent = '';

    const viewer = scope.querySelector('#artifacts-viewer');
    if (viewer) {
      viewer.innerHTML = '';
      viewer.appendChild(createLoadingSkeleton('card'));
    }

    try {
      const response = await api.get(`/artifacts/${artifact.encodedPath}`);
      state.currentContent = response.content || '';
      renderViewer(scope, state);
    } catch (error) {
      createToast({ type: 'error', message: error?.message || 'Failed to load artifact' });
      state.currentArtifact = null;
      renderViewer(scope, state);
    }
  }

  function backToList() {
    state.currentArtifact = null;
    state.currentContent = '';
    renderViewer(scope, state);
  }

  function onListClick(event) {
    const button = event.target.closest('[data-encoded-path]');
    if (!button) return;

    const encodedPath = button.dataset.encodedPath;
    const artifact = state.artifacts.find((a) => a.encodedPath === encodedPath);
    if (artifact) {
      void viewArtifact(artifact);
    }
  }

  listEl?.addEventListener('click', onListClick);
  backBtn?.addEventListener('click', backToList);

  try {
    const response = await api.get('/artifacts');
    state.artifacts = Array.isArray(response?.artifacts) ? response.artifacts : [];
    renderArtifactsList(scope, state);
    renderViewer(scope, state);
  } catch (error) {
    createToast({ type: 'error', message: error?.message || 'Failed to load artifacts' });
    renderArtifactsList(scope, state);
    renderViewer(scope, state);
  }

  return () => {
    listEl?.removeEventListener('click', onListClick);
    backBtn?.removeEventListener('click', backToList);
  };
}
