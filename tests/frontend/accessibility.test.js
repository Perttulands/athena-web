import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

class MockEventSource {
  constructor() {
    setTimeout(() => {
      this.onopen?.();
    }, 0);
  }

  addEventListener() {}
  close() {}
}

function jsonResponse(payload) {
  return {
    ok: true,
    async json() {
      return payload;
    }
  };
}

describe('Accessibility and UX Polish', () => {
  beforeEach(() => {
    const dom = new JSDOM(`
      <!doctype html>
      <html>
      <body>
        <main id="app"></main>
        <nav id="bottom-nav">
          <a href="#/oracle" data-page="oracle" aria-label="Oracle dashboard">Oracle</a>
          <a href="#/beads" data-page="beads" aria-label="Beads">Beads</a>
          <a href="#/agents" data-page="agents" aria-label="Agents">Agents</a>
          <a href="#/scrolls" data-page="scrolls" aria-label="Scrolls">Scrolls</a>
          <a href="#/chronicle" data-page="chronicle" aria-label="Chronicle">Chronicle</a>
        </nav>
        <div id="status-indicator"></div>
      </body>
      </html>
    `, {
      url: 'http://localhost:9000'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.EventSource = MockEventSource;

    global.fetch = async (url) => {
      if (String(url).includes('/api/agents')) return jsonResponse([]);
      if (String(url).includes('/api/docs')) return jsonResponse({ tree: [] });
      if (String(url).includes('/api/runs')) return jsonResponse([]);
      if (String(url).includes('/api/status')) return jsonResponse({
        athena: { lastMessage: 'hi', lastSeen: '2026-02-13T10:00:00Z' },
        agents: { running: 0, total: 0, successRate: 0 },
        beads: { active: 0 },
        ralph: { currentTask: null, iteration: 0, maxIterations: 0, prdProgress: { done: 0, total: 0 } },
        recentActivity: []
      });
      if (String(url).includes('/api/ralph')) return jsonResponse({ activeTask: null, currentIteration: 0, maxIterations: 0, prdProgress: { done: 0, total: 0 }, tasks: [] });
      return jsonResponse([]);
    };
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.EventSource;
    delete global.fetch;
  });

  it('has aria labels and app shell accessibility tags', async () => {
    const html = await readFile('public/index.html', 'utf8');

    assert.ok(html.includes('aria-label="Primary navigation"'));
    assert.ok(html.includes('role="main"'));
    assert.ok(html.includes('aria-live="polite"'));
  });

  it('marks active nav item with aria-current on navigation', async () => {
    const appModule = await import(`../../public/js/app.js?t=${Date.now()}`);

    window.location.hash = '#/agents';
    await appModule.navigate();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const active = document.querySelector('[data-page="agents"]');
    assert.strictEqual(active.getAttribute('aria-current'), 'page');
  });

  it('closes bottom sheet on Escape key', async () => {
    const components = await import(`../../public/js/components.js?t=${Date.now() + 1}`);

    const sheet = components.createBottomSheet({ title: 'Sheet test', content: 'hello' });
    sheet.open();

    const event = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    sheet.panel.dispatchEvent(event);

    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.strictEqual(document.querySelector('.bottom-sheet-overlay'), null);
  });
});
