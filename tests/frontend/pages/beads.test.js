/**
 * Tests for Beads page list view.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

function jsonResponse(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    async json() {
      return payload;
    }
  };
}

describe('Beads Page', () => {
  let module;
  let api;
  let dom;
  let fetchCalls;

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
      url: 'http://localhost:9000'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;

    fetchCalls = [];

    global.fetch = async (url) => {
      fetchCalls.push(url);

      if (String(url).includes('/api/beads?status=active')) {
        return jsonResponse([
          { id: 'bd-100', title: 'Active bead', status: 'active', priority: 1, created: '2026-02-01T10:00:00Z', updated: '2026-02-12T10:00:00Z' }
        ]);
      }

      if (String(url).includes('/api/beads')) {
        return jsonResponse([
          { id: 'bd-101', title: 'Done bead', status: 'done', priority: 3, created: '2026-02-02T10:00:00Z', updated: '2026-02-10T10:00:00Z' },
          { id: 'bd-100', title: 'Active bead', status: 'active', priority: 1, created: '2026-02-01T10:00:00Z', updated: '2026-02-12T10:00:00Z' }
        ]);
      }

      if (String(url).includes('/api/runs')) {
        return jsonResponse([]);
      }

      return jsonResponse([]);
    };

    const timestamp = Date.now();
    module = await import(`../../../public/js/pages/beads.js?t=${timestamp}`);
    api = (await import(`../../../public/js/api.js?t=${timestamp + 1}`)).default;
    api.clearCache();
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.fetch;
  });

  it('renders beads list and filter counts from API data', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();

    await module.mount(app);

    const cards = app.querySelectorAll('.bead-card');
    assert.strictEqual(cards.length, 2);

    const tabsText = app.querySelector('#beads-filter-tabs').textContent;
    assert.ok(tabsText.includes('All (2)'));
    assert.ok(tabsText.includes('Active (1)'));
    assert.ok(tabsText.includes('Done (1)'));
  });

  it('fetches filtered beads with query params when filter is clicked', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    await module.mount(app);

    fetchCalls = [];

    const activeButton = Array.from(app.querySelectorAll('.filter-tab'))
      .find((button) => button.textContent.includes('Active'));
    activeButton.click();

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.ok(fetchCalls.some((url) => String(url).includes('/api/beads?status=active')));
    assert.strictEqual(app.querySelectorAll('.bead-card').length, 1);
  });

  it('sorts beads by priority when selected', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    await module.mount(app);

    const select = app.querySelector('#beads-sort-select');
    select.value = 'priority';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    const cards = Array.from(app.querySelectorAll('.bead-card')).map((card) => card.textContent);
    assert.ok(cards[0].includes('bd-100'));
  });
});
