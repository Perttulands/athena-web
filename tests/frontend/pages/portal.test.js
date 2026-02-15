import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    }
  };
}

describe('Portal Page Shell', () => {
  let module;
  let dom;

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
      url: 'http://localhost:9000'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;

    global.fetch = async (url) => {
      const requestUrl = String(url);

      if (requestUrl.includes('/api/artifacts/roots')) {
        return jsonResponse({
          roots: [
            { alias: 'research', label: 'Research', readOnly: false, writable: true },
            { alias: 'results', label: 'Results', readOnly: true, writable: false }
          ]
        });
      }

      if (requestUrl.includes('/api/artifacts/tree?root=research')) {
        return jsonResponse({
          root: 'research',
          path: '',
          tree: [
            { path: 'notes.md', type: 'file' },
            {
              path: 'nested',
              type: 'dir',
              children: [
                { path: 'nested/guide.md', type: 'file' }
              ]
            }
          ]
        });
      }

      if (requestUrl.includes('/api/artifacts/tree?root=results')) {
        return jsonResponse({
          root: 'results',
          path: '',
          tree: []
        });
      }

      if (requestUrl.includes('/api/artifacts/doc?root=research&path=notes.md')) {
        return jsonResponse({
          root: 'research',
          path: 'notes.md',
          content: [
            '# Research Notes',
            '',
            '| Item | Value |',
            '| --- | --- |',
            '| Alpha | 42 |'
          ].join('\n'),
          metadata: { size: 20, mtime: new Date().toISOString() }
        });
      }

      if (requestUrl.includes('/api/artifacts/doc?root=research&path=nested%2Fguide.md')) {
        return jsonResponse({
          root: 'research',
          path: 'nested/guide.md',
          content: '## Guide\n\nUse `rg` to search.',
          metadata: { size: 20, mtime: new Date().toISOString() }
        });
      }

      if (requestUrl.includes('/api/artifacts/search?q=alpha')) {
        return jsonResponse({
          results: [
            {
              root: 'research',
              path: 'notes.md',
              line: 4,
              snippet: '| Alpha | 42 |'
            }
          ]
        });
      }

      if (requestUrl.includes('/api/artifacts/search?q=missing')) {
        return jsonResponse({ results: [] });
      }

      if (requestUrl.includes('/api/inbox')) {
        return jsonResponse({ items: [] });
      }

      if (requestUrl.includes('/api/docs')) {
        return jsonResponse({ tree: [] });
      }

      return jsonResponse({});
    };

    module = await import(`../../../public/js/pages/portal.js?t=${Date.now()}`);
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.fetch;
  });

  it('renders portal tabs and defaults to artifacts tab', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    const activeTab = app.querySelector('.portal-tab[aria-selected="true"]');
    assert.ok(app.textContent.includes('Portal'));
    assert.strictEqual(activeTab?.dataset.portalTab, 'artifacts');

    unmount?.();
  });

  it('renders artifact tree and opens markdown docs with anchors and tables', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.ok(app.querySelector('#portal-artifact-root'));
    assert.ok(app.textContent.includes('notes.md'));

    const notesButton = app.querySelector('[data-portal-file-path="notes.md"]');
    notesButton.click();
    await new Promise((resolve) => setTimeout(resolve, 40));

    const viewer = app.querySelector('#portal-artifacts-viewer');
    assert.ok(viewer.querySelector('.markdown-body'));
    assert.ok(viewer.querySelector('h1#research-notes'));
    assert.ok(viewer.querySelector('h1 .portal-heading-anchor'));
    assert.ok(viewer.querySelector('table'));

    unmount?.();
  });

  it('runs artifact search and supports slash/escape keyboard shortcuts', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    await new Promise((resolve) => setTimeout(resolve, 40));

    const searchInput = app.querySelector('#portal-artifacts-search-input');
    const searchForm = app.querySelector('#portal-artifacts-search-form');

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: '/', bubbles: true }));
    assert.strictEqual(document.activeElement, searchInput);

    searchInput.value = 'alpha';
    searchForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.ok(app.textContent.includes('notes.md'));
    assert.ok(app.textContent.includes('line 4'));

    searchInput.value = 'missing';
    searchForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.ok(app.textContent.includes('No matching artifacts found.'));

    searchInput.value = 'alpha';
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.strictEqual(searchInput.value, '');

    unmount?.();
  });

  it('shows empty state when selected artifact root has no files', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    await new Promise((resolve) => setTimeout(resolve, 40));

    const rootSelect = app.querySelector('#portal-artifact-root');
    rootSelect.value = 'results';
    rootSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.ok(app.textContent.includes('No files found in this root.'));

    unmount?.();
  });

  it('switches tabs between artifacts, workspace, and inbox', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    const workspaceTab = app.querySelector('[data-portal-tab="workspace"]');
    workspaceTab.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.ok(app.textContent.includes('Scrolls'));

    const inboxTab = app.querySelector('[data-portal-tab="inbox"]');
    inboxTab.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.ok(app.textContent.includes('Inbox'));

    unmount?.();
  });

  it('inbox tab shows title input, format selector, and send button', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    const inboxTab = app.querySelector('[data-portal-tab="inbox"]');
    inboxTab.click();
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.ok(app.querySelector('#inbox-title-input'), 'title input exists');
    assert.ok(app.querySelector('#inbox-format-select'), 'format selector exists');
    assert.ok(app.textContent.includes('Send to Athena'), 'send button text');

    unmount?.();
  });

  it('inbox tab text submit sends title and format', async () => {
    let capturedPayload = null;
    global.fetch = async (url, options) => {
      const requestUrl = String(url);

      if (requestUrl.includes('/api/inbox/text') && options?.method === 'POST') {
        capturedPayload = JSON.parse(options.body);
        return jsonResponse({ saved: true, id: 'test-id', status: 'incoming' });
      }

      if (requestUrl.includes('/api/inbox')) {
        return jsonResponse({ items: [] });
      }

      if (requestUrl.includes('/api/artifacts/roots')) {
        return jsonResponse({ roots: [] });
      }

      if (requestUrl.includes('/api/docs')) {
        return jsonResponse({ tree: [] });
      }

      return jsonResponse({});
    };

    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    const inboxTab = app.querySelector('[data-portal-tab="inbox"]');
    inboxTab.click();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const titleInput = app.querySelector('#inbox-title-input');
    const textInput = app.querySelector('#inbox-text-input');
    const formatSelect = app.querySelector('#inbox-format-select');
    const textForm = app.querySelector('#inbox-text-form');

    titleInput.value = 'My Notes';
    textInput.value = 'Hello world';
    formatSelect.value = 'md';

    textForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.ok(capturedPayload, 'API was called');
    assert.strictEqual(capturedPayload.title, 'My Notes');
    assert.strictEqual(capturedPayload.text, 'Hello world');
    assert.strictEqual(capturedPayload.format, 'md');

    unmount?.();
  });

  it('inbox tab upload triggers API call', async () => {
    let uploadCalled = false;
    global.fetch = async (url, options) => {
      const requestUrl = String(url);

      if (requestUrl.includes('/api/inbox/upload') && options?.method === 'POST') {
        uploadCalled = true;
        return jsonResponse({ saved: true, id: 'upload-id', status: 'incoming' });
      }

      if (requestUrl.includes('/api/inbox')) {
        return jsonResponse({ items: [] });
      }

      if (requestUrl.includes('/api/artifacts/roots')) {
        return jsonResponse({ roots: [] });
      }

      if (requestUrl.includes('/api/docs')) {
        return jsonResponse({ tree: [] });
      }

      return jsonResponse({});
    };

    global.FormData = class {
      constructor() { this.data = {}; }
      append(key, val) { this.data[key] = val; }
    };

    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    const inboxTab = app.querySelector('[data-portal-tab="inbox"]');
    inboxTab.click();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const uploadForm = app.querySelector('#inbox-upload-form');
    const fileInput = app.querySelector('#inbox-file-input');

    const mockFile = { name: 'test.txt', size: 100, type: 'text/plain' };
    Object.defineProperty(fileInput, 'files', { value: [mockFile], writable: true });
    fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));

    uploadForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.ok(uploadCalled, 'Upload API was called');

    delete global.FormData;
    unmount?.();
  });

  it('inbox tab renders queue items with status badges', async () => {
    const inboxItems = [
      { name: 'file1.txt', size: 1024, created: new Date().toISOString(), status: 'incoming' },
      { name: 'file2.md', size: 2048, created: new Date().toISOString(), status: 'done' }
    ];

    global.fetch = async (url) => {
      const requestUrl = String(url);

      if (requestUrl.includes('/api/inbox')) {
        return jsonResponse({ items: inboxItems });
      }

      if (requestUrl.includes('/api/artifacts/roots')) {
        return jsonResponse({ roots: [] });
      }

      if (requestUrl.includes('/api/artifacts/tree')) {
        return jsonResponse({ tree: [] });
      }

      if (requestUrl.includes('/api/docs')) {
        return jsonResponse({ tree: [] });
      }

      return jsonResponse({});
    };

    // Clear api cache to ensure fresh fetch
    const apiMod = await import('../../../public/js/api.js');
    apiMod.default?.clearCache();

    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    await new Promise((resolve) => setTimeout(resolve, 40));

    const inboxTab = app.querySelector('[data-portal-tab="inbox"]');
    inboxTab.click();
    await new Promise((resolve) => setTimeout(resolve, 120));

    assert.ok(app.textContent.includes('file1.txt'), 'file1.txt visible');
    assert.ok(app.textContent.includes('file2.md'), 'file2.md visible');
    const badges = app.querySelectorAll('.badge');
    assert.ok(badges.length >= 2, 'has status badges');

    unmount?.();
  });

  it('SSE artifact_update event triggers tree refresh', async () => {
    let fetchCount = 0;
    global.fetch = async (url) => {
      const requestUrl = String(url);

      if (requestUrl.includes('/api/artifacts/roots')) {
        return jsonResponse({
          roots: [{ alias: 'research', label: 'Research' }]
        });
      }

      if (requestUrl.includes('/api/artifacts/tree')) {
        fetchCount++;
        return jsonResponse({
          root: 'research',
          path: '',
          tree: [{ path: 'file.md', type: 'file' }]
        });
      }

      if (requestUrl.includes('/api/inbox')) {
        return jsonResponse({ items: [] });
      }

      if (requestUrl.includes('/api/docs')) {
        return jsonResponse({ tree: [] });
      }

      return jsonResponse({});
    };

    // Mock the SSE module with a dispatchable listener system
    const sseListeners = {};
    const mockSSE = {
      on(type, cb) {
        if (!sseListeners[type]) sseListeners[type] = [];
        sseListeners[type].push(cb);
      },
      off(type, cb) {
        if (sseListeners[type]) {
          sseListeners[type] = sseListeners[type].filter((h) => h !== cb);
        }
      }
    };

    // Inject the mock SSE into the module system
    // Since sse.js exports a singleton, we need to use the actual module
    const sseMod = await import('../../../public/js/sse.js');
    const originalOn = sseMod.default?.on;
    const originalOff = sseMod.default?.off;
    if (sseMod.default) {
      sseMod.default.on = mockSSE.on;
      sseMod.default.off = mockSSE.off;
    }

    const apiMod = await import('../../../public/js/api.js');
    apiMod.default?.clearCache();

    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    await new Promise((resolve) => setTimeout(resolve, 80));

    const initialFetchCount = fetchCount;

    // Simulate an SSE artifact_update event
    if (sseListeners['artifact_update']) {
      sseListeners['artifact_update'].forEach((cb) =>
        cb({ source: 'artifact', root: 'research', eventType: 'change', file: 'file.md' })
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 120));

    assert.ok(fetchCount > initialFetchCount, 'tree was refreshed after SSE event');

    unmount?.();

    // Restore original SSE methods
    if (sseMod.default) {
      sseMod.default.on = originalOn;
      sseMod.default.off = originalOff;
    }
  });
});
