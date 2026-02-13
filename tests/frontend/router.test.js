import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

class MockEventSource {
  constructor() {
    setTimeout(() => this.onopen?.(), 0);
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

describe('Router', () => {
  let navigate;
  let updateActiveNav;

  before(async () => {
    const dom = new JSDOM(`
      <!doctype html>
      <html>
        <body>
          <main id="app"></main>
          <div id="status-indicator"></div>
          <nav id="bottom-nav">
            <a href="#/oracle" data-page="oracle">Oracle</a>
            <a href="#/beads" data-page="beads">Beads</a>
            <a href="#/agents" data-page="agents">Agents</a>
            <a href="#/scrolls" data-page="scrolls">Scrolls</a>
            <a href="#/chronicle" data-page="chronicle">Chronicle</a>
          </nav>
        </body>
      </html>
    `, { url: 'http://localhost:9000' });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.EventSource = MockEventSource;

    global.fetch = async (url) => {
      if (String(url).includes('/api/status')) {
        return jsonResponse({
          athena: { lastMessage: 'Ready', lastSeen: '2026-02-13T10:00:00Z' },
          agents: { running: 0, total: 0, successRate: 0 },
          beads: { active: 0 },
          ralph: { currentTask: null, iteration: 0, maxIterations: 0, prdProgress: { done: 0, total: 0 } },
          recentActivity: []
        });
      }

      if (String(url).includes('/api/ralph')) {
        return jsonResponse({ activeTask: null, currentIteration: 0, maxIterations: 0, prdProgress: { done: 0, total: 0 }, tasks: [] });
      }

      if (String(url).includes('/api/docs')) {
        return jsonResponse({ tree: [] });
      }

      return jsonResponse([]);
    };

    const mod = await import(`../../public/js/app.js?t=${Date.now()}`);
    navigate = mod.navigate;
    updateActiveNav = mod.updateActiveNav;
  });

  after(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.EventSource;
    delete global.fetch;
  });

  it('routes to oracle by default', async () => {
    window.location.hash = '';
    await navigate();
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.ok(document.querySelector('#app').textContent.includes('Oracle'));
  });

  it('routes to each feature page', async () => {
    for (const [hash, title] of [
      ['#/beads', 'Beads'],
      ['#/agents', 'Agents'],
      ['#/scrolls', 'Scrolls'],
      ['#/chronicle', 'Chronicle']
    ]) {
      window.location.hash = hash;
      await navigate();
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.ok(document.querySelector('#app').textContent.includes(title));
    }
  });

  it('marks active nav item', () => {
    updateActiveNav('/beads');

    const active = document.querySelector('[data-page="beads"]');
    const inactive = document.querySelector('[data-page="oracle"]');

    assert.ok(active.classList.contains('active'));
    assert.strictEqual(active.getAttribute('aria-current'), 'page');
    assert.ok(!inactive.classList.contains('active'));
  });
});
