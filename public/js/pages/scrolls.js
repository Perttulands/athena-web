/**
 * Scrolls Page
 * Document tree + markdown viewer + edit mode.
 */

import api from '../api.js';
import { renderMarkdown } from '../markdown.js';
import { createConfirmDialog, createLoadingSkeleton, createToast } from '../components.js';

function encodePath(path) {
  return String(path || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function basename(path) {
  const chunks = String(path || '').split('/');
  return chunks[chunks.length - 1] || path;
}

function flattenFiles(tree, files = []) {
  if (!Array.isArray(tree)) return files;
  tree.forEach((entry) => {
    if (entry.type === 'file') {
      files.push(entry.path);
      return;
    }

    if (entry.type === 'dir' && Array.isArray(entry.children)) {
      flattenFiles(entry.children, files);
    }
  });

  return files;
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

function createTreeNode(entry, state) {
  if (entry.type === 'dir') {
    const details = document.createElement('details');
    details.className = 'scroll-tree-dir';
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

    const childWrap = document.createElement('div');
    childWrap.className = 'scroll-tree-children';

    normalizeTree(entry.children).forEach((child) => {
      childWrap.appendChild(createTreeNode(child, state));
    });

    details.appendChild(childWrap);
    return details;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `scroll-tree-file${state.currentPath === entry.path ? ' active' : ''}`;
  button.dataset.filePath = entry.path;
  button.textContent = basename(entry.path);
  button.setAttribute('aria-label', `Open ${entry.path}`);
  return button;
}

function renderTree(scope, state) {
  const treeRoot = scope.querySelector('#scrolls-tree');
  if (!treeRoot) return;

  treeRoot.innerHTML = '';

  const items = normalizeTree(state.tree);
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No documents found in this workspace.';
    treeRoot.appendChild(empty);
    return;
  }

  items.forEach((entry) => {
    treeRoot.appendChild(createTreeNode(entry, state));
  });
}

function renderBreadcrumb(scope, path) {
  const breadcrumb = scope.querySelector('#scrolls-breadcrumb');
  if (!breadcrumb) return;

  if (!path) {
    breadcrumb.textContent = 'No file selected';
    return;
  }

  breadcrumb.textContent = path;
}

function renderViewer(scope, state) {
  const viewer = scope.querySelector('#scrolls-viewer');
  const toolbar = scope.querySelector('#scrolls-toolbar-actions');
  if (!viewer || !toolbar) return;

  toolbar.innerHTML = '';
  viewer.innerHTML = '';

  if (!state.currentPath) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Select a document to begin.';
    viewer.appendChild(empty);
    return;
  }

  if (!state.editMode) {
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-ghost btn-sm';
    editButton.id = 'scrolls-edit-btn';
    editButton.textContent = 'Edit';
    editButton.setAttribute('aria-label', `Edit ${state.currentPath}`);
    toolbar.appendChild(editButton);

    viewer.appendChild(renderMarkdown(state.currentContent));
    return;
  }

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'btn btn-primary btn-sm';
  saveButton.id = 'scrolls-save-btn';
  saveButton.textContent = 'Save';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn btn-ghost btn-sm';
  cancelButton.id = 'scrolls-cancel-btn';
  cancelButton.textContent = 'Cancel';

  toolbar.append(saveButton, cancelButton);

  const editor = document.createElement('textarea');
  editor.className = 'scrolls-editor';
  editor.id = 'scrolls-editor';
  editor.value = state.editBuffer;
  editor.setAttribute('aria-label', `Editing ${state.currentPath}`);

  viewer.classList.add('scrolls-edit-mode');
  viewer.appendChild(editor);

  setTimeout(() => {
    editor.focus();
    editor.selectionStart = editor.value.length;
    editor.selectionEnd = editor.value.length;
  }, 10);
}

function clearEditModeClass(scope) {
  const viewer = scope.querySelector('#scrolls-viewer');
  viewer?.classList.remove('scrolls-edit-mode');
}

async function readDoc(path) {
  return api.get(`/docs/${encodePath(path)}`);
}

async function writeDoc(path, content) {
  return api.put(`/docs/${encodePath(path)}`, { content });
}

export function render() {
  return `
    <div class="container page-shell page-scrolls">
      <header class="page-header">
        <h1 class="page-title">Scrolls</h1>
        <p class="page-subtitle">Browse and edit workspace documentation.</p>
      </header>

      <section class="scrolls-layout">
        <aside class="scrolls-sidebar" id="scrolls-sidebar">
          <button type="button" id="scrolls-tree-toggle" class="btn btn-ghost btn-sm scrolls-tree-toggle" aria-expanded="false" aria-controls="scrolls-tree-wrap">
            Browse Files
          </button>
          <div id="scrolls-tree-wrap" class="scrolls-tree-wrap">
            <div id="scrolls-tree" class="scrolls-tree" aria-label="Document tree"></div>
          </div>
        </aside>

        <section class="scrolls-content card">
          <header class="scrolls-content-header">
            <div id="scrolls-breadcrumb" class="scrolls-breadcrumb">No file selected</div>
            <div id="scrolls-toolbar-actions" class="scrolls-toolbar-actions"></div>
          </header>
          <div id="scrolls-viewer" class="scrolls-viewer" aria-live="polite">
            <div class="skeleton skeleton-card"></div>
          </div>
        </section>
      </section>
    </div>
  `;
}

export async function mount(root) {
  const scope = root?.querySelector('.page-scrolls') || document.querySelector('.page-scrolls');
  if (!scope) return () => {};

  const state = {
    tree: [],
    openDirs: new Set(),
    currentPath: null,
    currentContent: '',
    editMode: false,
    editBuffer: ''
  };

  const treeRoot = scope.querySelector('#scrolls-tree');
  const sidebar = scope.querySelector('#scrolls-sidebar');
  const treeToggle = scope.querySelector('#scrolls-tree-toggle');
  const toolbar = scope.querySelector('#scrolls-toolbar-actions');

  async function selectFile(path) {
    if (!path) return;

    clearEditModeClass(scope);
    state.editMode = false;

    renderBreadcrumb(scope, path);
    const viewer = scope.querySelector('#scrolls-viewer');
    if (viewer) {
      viewer.innerHTML = '';
      viewer.appendChild(createLoadingSkeleton('card'));
    }

    try {
      const doc = await readDoc(path);
      state.currentPath = doc.path;
      state.currentContent = String(doc.content || '');
      state.editBuffer = state.currentContent;

      renderTree(scope, state);
      renderViewer(scope, state);
      clearEditModeClass(scope);
      renderBreadcrumb(scope, state.currentPath);

      sidebar?.classList.remove('open');
      if (treeToggle) {
        treeToggle.setAttribute('aria-expanded', 'false');
      }
    } catch (error) {
      createToast({ type: 'error', message: error?.message || 'Failed to read document' });
      renderViewer(scope, state);
    }
  }

  function beginEdit() {
    if (!state.currentPath) return;
    state.editMode = true;
    state.editBuffer = state.currentContent;
    renderViewer(scope, state);
  }

  async function saveEdit() {
    if (!state.currentPath) return;

    const editor = scope.querySelector('#scrolls-editor');
    const nextValue = editor ? editor.value : state.editBuffer;

    try {
      await writeDoc(state.currentPath, nextValue);
      state.currentContent = nextValue;
      state.editBuffer = nextValue;
      state.editMode = false;
      clearEditModeClass(scope);
      renderViewer(scope, state);
      createToast({ type: 'success', message: `Saved ${state.currentPath}` });
    } catch (error) {
      createToast({ type: 'error', message: error?.message || 'Failed to save document' });
    }
  }

  function cancelEdit() {
    const editor = scope.querySelector('#scrolls-editor');
    const draft = editor ? editor.value : state.editBuffer;
    const hasChanges = draft !== state.currentContent;

    const finishCancel = () => {
      state.editMode = false;
      state.editBuffer = state.currentContent;
      clearEditModeClass(scope);
      renderViewer(scope, state);
    };

    if (!hasChanges) {
      finishCancel();
      return;
    }

    const dialog = createConfirmDialog({
      title: 'Discard unsaved changes?',
      message: 'Your edits will be lost if you cancel now.',
      onConfirm: finishCancel
    });
    document.body.appendChild(dialog);
  }

  function onTreeClick(event) {
    const fileButton = event.target.closest('[data-file-path]');
    if (!fileButton) return;

    const filePath = fileButton.dataset.filePath;
    if (!filePath) return;
    void selectFile(filePath);
  }

  function onToolbarClick(event) {
    if (event.target.closest('#scrolls-edit-btn')) {
      beginEdit();
      return;
    }

    if (event.target.closest('#scrolls-save-btn')) {
      void saveEdit();
      return;
    }

    if (event.target.closest('#scrolls-cancel-btn')) {
      cancelEdit();
    }
  }

  function onEditorKeyDown(event) {
    const editor = event.target.closest('#scrolls-editor');
    if (!editor) return;

    if (event.key === 'Tab') {
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const value = editor.value;
      editor.value = `${value.slice(0, start)}  ${value.slice(end)}`;
      editor.selectionStart = editor.selectionEnd = start + 2;
      return;
    }

    const saveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
    if (saveShortcut) {
      event.preventDefault();
      void saveEdit();
    }
  }

  function onGlobalKeyDown(event) {
    if (event.key === 'Escape' && state.editMode) {
      event.preventDefault();
      cancelEdit();
      return;
    }

    const saveShortcut = state.editMode && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
    if (saveShortcut) {
      event.preventDefault();
      void saveEdit();
    }
  }

  function onTreeToggle() {
    sidebar?.classList.toggle('open');
    if (treeToggle && sidebar) {
      treeToggle.setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
    }
  }

  treeRoot?.addEventListener('click', onTreeClick);
  toolbar?.addEventListener('click', onToolbarClick);
  scope.addEventListener('keydown', onEditorKeyDown);
  document.addEventListener('keydown', onGlobalKeyDown);
  treeToggle?.addEventListener('click', onTreeToggle);

  try {
    const response = await api.get('/docs');
    state.tree = Array.isArray(response?.tree) ? response.tree : [];
    renderTree(scope, state);
    renderViewer(scope, state);

    const files = flattenFiles(state.tree);
    if (files.length > 0) {
      await selectFile(files[0]);
    }
  } catch (error) {
    state.tree = [];
    renderTree(scope, state);
    renderViewer(scope, state);
    createToast({ type: 'error', message: error?.message || 'Failed to load scrolls tree' });
  }

  return () => {
    treeRoot?.removeEventListener('click', onTreeClick);
    toolbar?.removeEventListener('click', onToolbarClick);
    scope.removeEventListener('keydown', onEditorKeyDown);
    document.removeEventListener('keydown', onGlobalKeyDown);
    treeToggle?.removeEventListener('click', onTreeToggle);
  };
}
