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
      if (String(url).includes('/api/artifacts')) {
        return jsonResponse({ artifacts: [] });
      }

      if (String(url).includes('/api/inbox')) {
        return jsonResponse({ items: [] });
      }

      if (String(url).includes('/api/docs')) {
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
});
