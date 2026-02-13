import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

class MockEventSource {
  constructor() {
    this.listeners = {};
    this.onopen = null;

    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }

  addEventListener(type, callback) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(callback);
  }

  close() {}
}

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

describe('Oracle Page', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body><main id="app"></main><div id="status-indicator"></div></body></html>', {
      url: 'http://localhost:9000'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.EventSource = MockEventSource;
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.EventSource;
    delete global.fetch;
  });

  it('renders stat cards and loads data from status/agents/ralph endpoints', async () => {
    const calls = [];

    global.fetch = async (url) => {
      calls.push(url);

      if (url === '/api/status') {
        return jsonResponse({
          athena: { lastMessage: 'Athena watches', lastSeen: '2026-02-13T10:20:00Z' },
          agents: { running: 2, total: 3, successRate: 0.75 },
          beads: { active: 5 },
          ralph: { currentTask: 'US-017', iteration: 2, maxIterations: 6, prdProgress: { done: 3, total: 6 } },
          recentActivity: [
            { time: '2026-02-13T10:21:00Z', type: 'agent_complete', message: 'Agent bd-301 completed' }
          ]
        });
      }

      if (url === '/api/agents') {
        return jsonResponse([
          {
            name: 'agent-bd-301',
            status: 'running',
            bead: 'bd-301',
            runningTime: '12m',
            lastOutput: 'All tests green',
            contextPercent: 44
          },
          {
            name: 'agent-bd-302',
            status: 'idle',
            bead: 'bd-302',
            runningTime: '2m',
            lastOutput: 'waiting',
            contextPercent: 10
          }
        ]);
      }

      if (url === '/api/ralph') {
        return jsonResponse({
          activeTask: 'US-017',
          currentIteration: 2,
          maxIterations: 6,
          prdProgress: { done: 3, total: 6 },
          tasks: [
            { id: 'US-017', title: 'Oracle stat cards', done: false },
            { id: 'US-018', title: 'Agent feed', done: false },
            { id: 'US-019', title: 'Ralph section', done: false },
            { id: 'US-020', title: 'SSE updates', done: false }
          ]
        });
      }

      return jsonResponse({});
    };

    const module = await import(`../../../public/js/pages/oracle.js?t=${Date.now()}`);
    const app = document.querySelector('#app');
    app.innerHTML = module.render();

    const unmount = await module.mount(app);

    assert.ok(calls.includes('/api/status'));
    assert.ok(calls.includes('/api/agents'));
    assert.ok(calls.includes('/api/ralph'));

    assert.strictEqual(
      app.querySelector('[data-stat-id="agents-running"] .stat-value').textContent,
      '2'
    );
    assert.strictEqual(
      app.querySelector('[data-stat-id="beads-active"] .stat-value').textContent,
      '5'
    );
    assert.strictEqual(
      app.querySelector('[data-stat-id="success-rate"] .stat-value').textContent,
      '75%'
    );
    assert.strictEqual(
      app.querySelector('[data-stat-id="ralph-progress"] .stat-value').textContent,
      '3/6'
    );

    assert.ok(app.querySelector('#oracle-message-text').textContent.includes('Athena watches'));
    assert.strictEqual(app.querySelectorAll('.agent-status-card').length, 1);
    assert.strictEqual(app.querySelectorAll('#oracle-activity-list .activity-item').length, 1);
    assert.ok(app.querySelector('.ralph-current-task-id').textContent.includes('US-017'));

    const agentCard = app.querySelector('.agent-status-card');
    agentCard.click();
    assert.strictEqual(window.location.hash, '#/agents');

    unmount?.();
  });

  it('shows loading skeletons before async data resolves', async () => {
    let resolveStatus;
    const statusPromise = new Promise((resolve) => {
      resolveStatus = resolve;
    });

    global.fetch = async (url) => {
      if (url === '/api/status') {
        return statusPromise;
      }

      if (url === '/api/agents') {
        return jsonResponse([]);
      }

      if (url === '/api/ralph') {
        return jsonResponse({
          activeTask: null,
          currentIteration: 0,
          maxIterations: 0,
          prdProgress: { done: 0, total: 0 },
          tasks: []
        });
      }

      return jsonResponse({});
    };

    const module = await import(`../../../public/js/pages/oracle.js?t=${Date.now()}`);
    const app = document.querySelector('#app');
    app.innerHTML = module.render();

    const mounting = module.mount(app);

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(app.querySelectorAll('.skeleton').length > 0);

    resolveStatus(jsonResponse({
      athena: { lastMessage: 'Ready', lastSeen: '2026-02-13T10:22:00Z' },
      agents: { running: 0, total: 0, successRate: 0 },
      beads: { active: 0 },
      ralph: { currentTask: null, iteration: 0, maxIterations: 0, prdProgress: { done: 0, total: 0 } },
      recentActivity: []
    }));

    const unmount = await mounting;
    unmount?.();
  });

  it('shows Ralph empty state when no loop data exists', async () => {
    global.fetch = async (url) => {
      if (url === '/api/status') {
        return jsonResponse({
          athena: { lastMessage: 'Quiet', lastSeen: '2026-02-13T10:20:00Z' },
          agents: { running: 0, total: 0, successRate: 0 },
          beads: { active: 0 },
          ralph: { currentTask: null, iteration: 0, maxIterations: 0, prdProgress: { done: 0, total: 0 } },
          recentActivity: []
        });
      }

      if (url === '/api/agents') {
        return jsonResponse([]);
      }

      if (url === '/api/ralph') {
        return jsonResponse({
          activeTask: null,
          currentIteration: 0,
          maxIterations: 0,
          prdProgress: { done: 0, total: 0 },
          tasks: []
        });
      }

      return jsonResponse({});
    };

    const module = await import(`../../../public/js/pages/oracle.js?t=${Date.now()}`);
    const app = document.querySelector('#app');
    app.innerHTML = module.render();

    const unmount = await module.mount(app);
    assert.ok(app.querySelector('#oracle-ralph-content').textContent.includes('No active Ralph loop'));
    unmount?.();
  });
});
