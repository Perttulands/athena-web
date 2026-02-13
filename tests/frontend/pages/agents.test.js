import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

class MockEventSource {
  constructor() {
    this.listeners = {};
    setTimeout(() => {
      this.onopen?.();
    }, 0);
  }

  addEventListener(type, cb) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(cb);
  }

  close() {}
}

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    }
  };
}

describe('Agents Page', () => {
  let module;
  let sse;
  let dom;

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body><div id="status-indicator"></div><main id="app"></main></body></html>', {
      url: 'http://localhost:9000'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.EventSource = MockEventSource;

    global.fetch = async (url) => {
      if (String(url).includes('/api/agents')) {
        return jsonResponse([
          {
            name: 'agent-bd-101',
            bead: 'bd-101',
            status: 'running',
            startedAt: new Date(Date.now() - 120000).toISOString(),
            lastOutput: 'line 1\nline 2\nline 3',
            contextPercent: 48
          },
          {
            name: 'agent-bd-100',
            bead: 'bd-100',
            status: 'running',
            startedAt: new Date(Date.now() - 300000).toISOString(),
            lastOutput: 'older',
            contextPercent: 12
          }
        ]);
      }

      if (String(url).includes('/api/agents/')) {
        return jsonResponse({ name: 'agent-bd-101', output: 'output text' });
      }

      return jsonResponse([]);
    };

    const ts = Date.now();
    sse = (await import(`../../../public/js/sse.js?t=${ts}`)).default;
    module = await import(`../../../public/js/pages/agents.js?t=${ts + 1}`);
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.EventSource;
    delete global.fetch;
  });

  it('renders agent cards from API and running timer label', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    const cards = app.querySelectorAll('.agent-monitor-card');
    assert.strictEqual(cards.length, 2);
    assert.ok(app.textContent.includes('agent-bd-101'));
    assert.ok(app.querySelector('.agent-running-time').textContent.includes('Running'));

    unmount?.();
  });

  it('shows empty state when no agents are running', async () => {
    global.fetch = async () => jsonResponse([]);

    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    assert.ok(app.textContent.includes('No agents running. The swarm rests.'));
    unmount?.();
  });

  it('applies SSE updates to cards in real time', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    sse.dispatch('agent_status', {
      agents: [
        {
          name: 'agent-bd-200',
          bead: 'bd-200',
          status: 'running',
          startedAt: new Date().toISOString(),
          lastOutput: 'new output',
          contextPercent: 77
        }
      ]
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const cards = app.querySelectorAll('.agent-monitor-card');
    assert.strictEqual(cards.length, 1);
    assert.ok(cards[0].textContent.includes('agent-bd-200'));

    unmount?.();
  });
});
