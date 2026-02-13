import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

class MockEventSource {
  constructor() {
    this.listeners = {};
    this.onopen = null;
    MockEventSource.instances.push(this);

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

  emitEvent(type, payload) {
    const list = this.listeners[type] || [];
    const event = { data: JSON.stringify(payload) };
    list.forEach((callback) => callback(event));
  }

  close() {}

  static instances = [];
}

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    async json() {
      return payload;
    }
  };
}

describe('Oracle Page SSE Updates', () => {
  beforeEach(() => {
    MockEventSource.instances = [];

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

  it('applies surgical dashboard updates from SSE events', async () => {
    global.fetch = async (url) => {
      if (url === '/api/status') {
        return jsonResponse({
          athena: { lastMessage: 'Ready', lastSeen: '2026-02-13T10:20:00Z' },
          agents: { running: 1, total: 1, successRate: 0.5 },
          beads: { active: 2 },
          ralph: { currentTask: 'US-017', iteration: 1, maxIterations: 4, prdProgress: { done: 1, total: 4 } },
          recentActivity: [
            { time: '2026-02-13T10:19:00Z', type: 'agent_complete', message: 'Agent bd-1 completed' }
          ]
        });
      }

      if (url === '/api/agents') {
        return jsonResponse([
          {
            name: 'agent-bd-1',
            status: 'running',
            bead: 'bd-1',
            runningTime: '4m',
            lastOutput: 'Compiling',
            contextPercent: 22
          }
        ]);
      }

      if (url === '/api/ralph') {
        return jsonResponse({
          activeTask: 'US-017',
          currentIteration: 1,
          maxIterations: 4,
          prdProgress: { done: 1, total: 4 },
          tasks: [
            { id: 'US-017', title: 'Cards', done: false },
            { id: 'US-018', title: 'Agents', done: false }
          ]
        });
      }

      return jsonResponse({});
    };

    const oracleModule = await import(`../../../public/js/pages/oracle.js?t=${Date.now()}`);
    const app = document.querySelector('#app');
    app.innerHTML = oracleModule.render();
    const unmount = await oracleModule.mount(app);

    const sseInstance = MockEventSource.instances[0];
    assert.ok(sseInstance, 'SSE instance should be initialized');

    sseInstance.emitEvent('bead_update', { active: 7 });
    assert.strictEqual(
      app.querySelector('[data-stat-id="beads-active"] .stat-value').textContent,
      '7'
    );

    sseInstance.emitEvent('agent_status', {
      agents: [
        {
          name: 'agent-bd-1',
          status: 'running',
          bead: 'bd-1',
          runningTime: '7m',
          lastOutput: 'Done',
          contextPercent: 40
        },
        {
          name: 'agent-bd-2',
          status: 'running',
          bead: 'bd-2',
          runningTime: '2m',
          lastOutput: 'Linting',
          contextPercent: 12
        }
      ],
      running: 2,
      total: 2
    });

    assert.strictEqual(app.querySelectorAll('.agent-status-card').length, 2);
    assert.strictEqual(
      app.querySelector('[data-stat-id="agents-running"] .stat-value').textContent,
      '2'
    );

    sseInstance.emitEvent('ralph_progress', {
      currentTask: 'US-020',
      currentIteration: 3,
      maxIterations: 4,
      prdProgress: { done: 3, total: 4 },
      tasks: [
        { id: 'US-020', title: 'SSE integration', done: false },
        { id: 'US-021', title: 'Pull to refresh', done: false }
      ]
    });

    assert.strictEqual(
      app.querySelector('[data-stat-id="ralph-progress"] .stat-value').textContent,
      '3/4'
    );
    assert.ok(app.querySelector('.ralph-current-task-id').textContent.includes('US-020'));

    sseInstance.emitEvent('activity', {
      time: '2026-02-13T10:23:00Z',
      type: 'ralph_step',
      message: 'Advanced to US-020'
    });

    const firstActivity = app.querySelector('#oracle-activity-list .activity-item .activity-message');
    assert.ok(firstActivity.textContent.includes('Advanced to US-020'));

    unmount?.();
  });
});
