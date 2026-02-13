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

describe('Scrolls Page Edit Mode', () => {
  let module;
  let fetchCalls;
  let dom;

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
      url: 'http://localhost:9000'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;

    fetchCalls = [];

    global.fetch = async (url, options = {}) => {
      fetchCalls.push({ url: String(url), method: options.method || 'GET', body: options.body });

      if ((options.method || 'GET') === 'PUT') {
        return jsonResponse({ saved: true, path: 'README.md' });
      }

      if (String(url).includes('/api/docs/README.md')) {
        return jsonResponse({ path: 'README.md', content: '# Readme\nInitial' });
      }

      if (String(url).includes('/api/docs')) {
        return jsonResponse({ tree: [{ path: 'README.md', type: 'file' }] });
      }

      return jsonResponse({});
    };

    module = await import(`../../../public/js/pages/scrolls.js?t=${Date.now()}`);
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.fetch;
  });

  it('toggles edit mode and saves via API', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    app.querySelector('#scrolls-edit-btn').click();
    const editor = app.querySelector('#scrolls-editor');
    assert.ok(editor);

    editor.value = '# Readme\nUpdated';
    app.querySelector('#scrolls-save-btn').click();

    await new Promise((resolve) => setTimeout(resolve, 80));

    const putCall = fetchCalls.find((call) => call.method === 'PUT');
    assert.ok(putCall);
    assert.ok(putCall.url.includes('/api/docs/README.md'));
    assert.ok(putCall.body.includes('Updated'));

    unmount?.();
  });

  it('prompts before cancelling with unsaved changes', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    app.querySelector('#scrolls-edit-btn').click();
    const editor = app.querySelector('#scrolls-editor');
    editor.value = 'changed';

    app.querySelector('#scrolls-cancel-btn').click();
    assert.ok(document.querySelector('.confirm-dialog-overlay'));

    unmount?.();
  });

  it('supports ctrl+s keyboard shortcut while editing', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    app.querySelector('#scrolls-edit-btn').click();
    const editor = app.querySelector('#scrolls-editor');
    editor.value = 'ctrl s save';

    const event = new dom.window.KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true
    });
    document.dispatchEvent(event);

    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.ok(fetchCalls.some((call) => call.method === 'PUT'));
    unmount?.();
  });
});
