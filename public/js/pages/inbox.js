/**
 * Inbox Page
 * Submit text snippets and upload files to Athena's inbox.
 */

import api from '../api.js';
import { createToast } from '../components.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.log',
  '.yaml',
  '.yml',
  '.xml',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.zip',
  '.gz',
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.css',
  '.html',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.sh',
  '.sql'
]);
const FILE_ACCEPT_VALUE = Array.from(ALLOWED_UPLOAD_EXTENSIONS).join(',');

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleString();
}

function resetDropZoneContent(dropZone) {
  if (!dropZone) return;

  const content = dropZone.querySelector('.inbox-drop-zone-content');
  if (!content) return;

  content.innerHTML = '';

  const icon = document.createElement('span');
  icon.className = 'inbox-drop-zone-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '📁';

  const title = document.createElement('p');
  title.textContent = 'Drag and drop a file here';

  const subtitle = document.createElement('p');
  subtitle.className = 'text-secondary';
  subtitle.textContent = 'or click to select';

  content.append(icon, title, subtitle);
}

function renderSelectedFile(dropZone, file) {
  if (!dropZone || !file) return;

  const content = dropZone.querySelector('.inbox-drop-zone-content');
  if (!content) return;

  content.innerHTML = '';

  const icon = document.createElement('span');
  icon.className = 'inbox-drop-zone-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '📄';

  const name = document.createElement('p');
  name.textContent = file.name;

  const meta = document.createElement('p');
  meta.className = 'text-secondary';
  meta.textContent = formatFileSize(file.size);

  content.append(icon, name, meta);
}

function getValidationError(file) {
  if (!file) return 'Please select a file';
  if (file.size <= 0) return 'Uploaded file is empty';
  if (file.size > MAX_UPLOAD_BYTES) return 'File too large (max 10MB)';

  const extensionIndex = file.name.lastIndexOf('.');
  const extension = extensionIndex >= 0 ? file.name.slice(extensionIndex).toLowerCase() : '';
  const extensionAllowed = ALLOWED_UPLOAD_EXTENSIONS.has(extension);
  const mimetypeAllowed = Boolean(file.type) && (
    file.type.startsWith('text/') ||
    file.type.startsWith('image/') ||
    file.type === 'application/json' ||
    file.type === 'application/xml' ||
    file.type === 'text/xml' ||
    file.type === 'application/pdf' ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed' ||
    file.type === 'application/gzip'
  );

  if (!extensionAllowed && !mimetypeAllowed) {
    return 'Unsupported file type';
  }

  return null;
}

function renderInboxItems(scope, items) {
  const listEl = scope.querySelector('#inbox-items-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No items in inbox yet.';
    listEl.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'inbox-item card card-compact';

    const name = document.createElement('div');
    name.className = 'inbox-item-name';
    name.textContent = item.name;

    const meta = document.createElement('div');
    meta.className = 'inbox-item-meta text-secondary';
    meta.textContent = `${formatFileSize(item.size)} • ${formatDate(item.created)}`;

    card.append(name, meta);
    listEl.appendChild(card);
  });
}

export function render() {
  return `
    <div class="container page-shell page-inbox">
      <header class="page-header">
        <h1 class="page-title">Inbox</h1>
        <p class="page-subtitle">Send text and files to Athena.</p>
      </header>

      <section class="inbox-layout">
        <div class="inbox-input-section">
          <div class="card">
            <h2 class="section-title">Submit Text</h2>
            <form id="inbox-text-form" class="inbox-text-form">
              <textarea
                id="inbox-text-input"
                class="inbox-text-area"
                placeholder="Paste code, notes, or any text here..."
                rows="8"
                aria-label="Text content to submit"
              ></textarea>
              <button type="submit" class="btn btn-primary">
                Submit Text
              </button>
            </form>
          </div>

          <div class="card">
            <h2 class="section-title">Upload File</h2>
            <form id="inbox-upload-form" class="inbox-upload-form">
              <div
                id="inbox-drop-zone"
                class="inbox-drop-zone"
                role="button"
                tabindex="0"
                aria-label="Drag and drop file or click to select"
              >
                <div class="inbox-drop-zone-content">
                  <span class="inbox-drop-zone-icon" aria-hidden="true">📁</span>
                  <p>Drag and drop a file here</p>
                  <p class="text-secondary">or click to select</p>
                </div>
                <input
                  type="file"
                  id="inbox-file-input"
                  class="inbox-file-input"
                  accept="${FILE_ACCEPT_VALUE}"
                  aria-label="File to upload"
                />
              </div>
              <button type="submit" class="btn btn-primary" id="inbox-upload-btn" disabled>
                Upload File
              </button>
            </form>
          </div>
        </div>

        <aside class="inbox-items-section card">
          <h2 class="section-title">Recent Items</h2>
          <div id="inbox-items-list" class="inbox-items-list" aria-live="polite">
            <div class="skeleton skeleton-card"></div>
          </div>
        </aside>
      </section>
    </div>
  `;
}

export async function mount(root) {
  const scope = root?.querySelector('.page-inbox') || document.querySelector('.page-inbox');
  if (!scope) return () => {};

  const state = {
    items: [],
    selectedFile: null
  };

  const textForm = scope.querySelector('#inbox-text-form');
  const textInput = scope.querySelector('#inbox-text-input');
  const uploadForm = scope.querySelector('#inbox-upload-form');
  const uploadBtn = scope.querySelector('#inbox-upload-btn');
  const fileInput = scope.querySelector('#inbox-file-input');
  const dropZone = scope.querySelector('#inbox-drop-zone');

  async function loadItems() {
    try {
      const response = await api.get('/inbox');
      state.items = Array.isArray(response?.items) ? response.items : [];
      renderInboxItems(scope, state.items);
    } catch (error) {
      createToast({ type: 'error', message: error?.message || 'Failed to load inbox items' });
    }
  }

  async function submitText(event) {
    event.preventDefault();

    const content = textInput.value.trim();
    if (!content) {
      createToast({ type: 'error', message: 'Please enter some text' });
      return;
    }

    try {
      await api.post('/inbox/text', { content });
      createToast({ type: 'success', message: 'Text submitted to inbox' });
      textInput.value = '';
      await loadItems();
    } catch (error) {
      createToast({ type: 'error', message: error?.message || 'Failed to submit text' });
    }
  }

  async function uploadFile(event) {
    event.preventDefault();

    if (!state.selectedFile) {
      createToast({ type: 'error', message: 'Please select a file' });
      return;
    }

    const formData = new FormData();
    formData.append('file', state.selectedFile);

    try {
      const response = await fetch('/api/inbox/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      createToast({ type: 'success', message: 'File uploaded to inbox' });
      state.selectedFile = null;
      fileInput.value = '';
      uploadBtn.disabled = true;
      await loadItems();
    } catch (error) {
      createToast({ type: 'error', message: error?.message || 'Failed to upload file' });
    }
  }

  function handleFileSelect(file) {
    if (!file) return;

    const validationError = getValidationError(file);
    if (validationError) {
      createToast({ type: 'error', message: validationError });
      state.selectedFile = null;
      uploadBtn.disabled = true;
      if (fileInput) {
        fileInput.value = '';
      }
      resetDropZoneContent(dropZone);
      return;
    }

    state.selectedFile = file;
    uploadBtn.disabled = false;
    renderSelectedFile(dropZone, file);
  }

  function onFileInputChange(event) {
    const file = event.target.files?.[0];
    handleFileSelect(file);
  }

  function onDragOver(event) {
    event.preventDefault();
    dropZone.classList.add('drag-over');
  }

  function onDragLeave(event) {
    event.preventDefault();
    dropZone.classList.remove('drag-over');
  }

  function onDrop(event) {
    event.preventDefault();
    dropZone.classList.remove('drag-over');

    const file = event.dataTransfer?.files?.[0];
    if (file) {
      if (typeof DataTransfer !== 'undefined') {
        try {
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          fileInput.files = dataTransfer.files;
        } catch {
          // Keep selected file in local state even if FileList assignment fails.
        }
      }

      handleFileSelect(file);
    }
  }

  function onDropZoneClick() {
    fileInput.click();
  }

  function onDropZoneKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  }

  textForm?.addEventListener('submit', submitText);
  uploadForm?.addEventListener('submit', uploadFile);
  fileInput?.addEventListener('change', onFileInputChange);
  dropZone?.addEventListener('click', onDropZoneClick);
  dropZone?.addEventListener('keydown', onDropZoneKeyDown);
  dropZone?.addEventListener('dragover', onDragOver);
  dropZone?.addEventListener('dragleave', onDragLeave);
  dropZone?.addEventListener('drop', onDrop);
  resetDropZoneContent(dropZone);

  await loadItems();

  return () => {
    textForm?.removeEventListener('submit', submitText);
    uploadForm?.removeEventListener('submit', uploadFile);
    fileInput?.removeEventListener('change', onFileInputChange);
    dropZone?.removeEventListener('click', onDropZoneClick);
    dropZone?.removeEventListener('keydown', onDropZoneKeyDown);
    dropZone?.removeEventListener('dragover', onDragOver);
    dropZone?.removeEventListener('dragleave', onDragLeave);
    dropZone?.removeEventListener('drop', onDrop);
  };
}
