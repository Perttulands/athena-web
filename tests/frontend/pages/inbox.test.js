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

describe('Inbox Page', () => {
  let module;
  let messageFetchCount;

  beforeEach(async () => {
    const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
      url: 'http://localhost:9000'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;

    messageFetchCount = 0;

    global.fetch = async (url, options = {}) => {
      const requestUrl = String(url);

      if (requestUrl.includes('/api/inbox/messages')) {
        messageFetchCount += 1;
        return jsonResponse({
          source: 'state/messages.json',
          messages: [
            {
              id: 'msg-1',
              title: 'Build complete',
              body: 'Artifact bd-1nn finished successfully.',
              from: 'agent-bd-1nn',
              level: 'normal',
              createdAt: '2026-02-13T10:00:00Z'
            }
          ]
        });
      }

      if (requestUrl.includes('/api/inbox') && options.method !== 'POST') {
        return jsonResponse({ items: [] });
      }

      if (requestUrl.includes('/api/inbox/text')) {
        return jsonResponse({ saved: true });
      }

      return jsonResponse({});
    };

    const apiMod = await import('../../../public/js/api.js');
    apiMod.default?.clearCache();

    module = await import(`../../../public/js/pages/inbox.js?t=${Date.now()}`);
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.fetch;
  });

  it('renders agent message notifications from store endpoint', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();

    const unmount = await module.mount(app);
    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.ok(app.textContent.includes('Agent Messages'));
    assert.ok(app.textContent.includes('Build complete'));
    assert.ok(app.textContent.includes('Artifact bd-1nn finished successfully.'));
    assert.ok(app.textContent.includes('Source: state/messages.json'));

    unmount?.();
  });

  it('refresh button reloads message store', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();

    const unmount = await module.mount(app);
    await new Promise((resolve) => setTimeout(resolve, 40));

    const beforeRefresh = messageFetchCount;
    const refreshButton = app.querySelector('#inbox-refresh-messages');
    refreshButton.click();

    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.ok(messageFetchCount > beforeRefresh, 'messages endpoint was fetched again');

    unmount?.();
  });
});
