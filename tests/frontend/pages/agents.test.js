import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

class MockEventSource {
  constructor() {
    this.listeners = {};
    this.openTimer = setTimeout(() => {
      this.onopen?.();
    }, 0);
    MockEventSource.instances.add(this);
  }

  addEventListener(type, cb) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(cb);
  }

  close() {
    if (this.openTimer) {
      clearTimeout(this.openTimer);
      this.openTimer = null;
    }
    MockEventSource.instances.delete(this);
  }

  static closeAll() {
    for (const source of MockEventSource.instances) {
      source.close();
    }
    MockEventSource.instances.clear();
  }

  static instances = new Set();
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
  let api;
  let sse;
  let dom;
  const unmountCallbacks = new Set();

  const nativeSetTimeout = global.setTimeout;
  const nativeClearTimeout = global.clearTimeout;
  const nativeSetInterval = global.setInterval;
  const nativeClearInterval = global.clearInterval;
  const timeoutHandles = new Set();
  const intervalHandles = new Set();
  let timerTrackingEnabled = false;

  function enableTimerTracking() {
    if (timerTrackingEnabled) return;
    timerTrackingEnabled = true;

    global.setTimeout = (...args) => {
      const handle = nativeSetTimeout(...args);
      timeoutHandles.add(handle);
      return handle;
    };

    global.clearTimeout = (handle) => {
      timeoutHandles.delete(handle);
      return nativeClearTimeout(handle);
    };

    global.setInterval = (...args) => {
      const handle = nativeSetInterval(...args);
      intervalHandles.add(handle);
      return handle;
    };

    global.clearInterval = (handle) => {
      intervalHandles.delete(handle);
      return nativeClearInterval(handle);
    };
  }

  function clearTrackedTimers() {
    for (const handle of timeoutHandles) {
      nativeClearTimeout(handle);
    }
    timeoutHandles.clear();

    for (const handle of intervalHandles) {
      nativeClearInterval(handle);
    }
    intervalHandles.clear();
  }

  function disableTimerTracking() {
    if (!timerTrackingEnabled) return;
    timerTrackingEnabled = false;
    global.setTimeout = nativeSetTimeout;
    global.clearTimeout = nativeClearTimeout;
    global.setInterval = nativeSetInterval;
    global.clearInterval = nativeClearInterval;
  }

  function runUnmounts() {
    for (const unmount of unmountCallbacks) {
      try {
        unmount?.();
      } catch {
        // no-op in cleanup
      }
    }
    unmountCallbacks.clear();
  }

  beforeEach(async () => {
    enableTimerTracking();
    MockEventSource.closeAll();

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
    api = (await import('../../../public/js/api.js')).default;
    api.clearCache();
    sse = (await import('../../../public/js/sse.js')).default;
    if (sse) {
      sse.listeners = {};
      if (sse.reconnectTimer) {
        clearTimeout(sse.reconnectTimer);
        sse.reconnectTimer = null;
      }
      sse.eventSource?.close?.();
      sse.eventSource = null;
    }
    module = await import(`../../../public/js/pages/agents.js?t=${ts + 1}`);
  });

  afterEach(() => {
    runUnmounts();
    api?.clearCache?.();
    if (sse) {
      if (sse.reconnectTimer) {
        clearTimeout(sse.reconnectTimer);
        sse.reconnectTimer = null;
      }
      sse.eventSource?.close?.();
      sse.eventSource = null;
      sse.listeners = {};
    }
    MockEventSource.closeAll();
    clearTrackedTimers();
    disableTimerTracking();
    dom?.window?.close();
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.EventSource;
    delete global.fetch;
  });

  after(() => {
    runUnmounts();
    api?.clearCache?.();
    if (sse) {
      if (sse.reconnectTimer) {
        clearTimeout(sse.reconnectTimer);
        sse.reconnectTimer = null;
      }
      sse.eventSource?.close?.();
      sse.eventSource = null;
      sse.listeners = {};
    }
    MockEventSource.closeAll();
    clearTrackedTimers();
    disableTimerTracking();
    dom?.window?.close();
  });

  it('renders agent cards from API and running timer label', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);
    unmountCallbacks.add(unmount);

    try {
      const cards = app.querySelectorAll('.agent-monitor-card');
      assert.strictEqual(cards.length, 2);
      assert.ok(app.textContent.includes('agent-bd-101'));
      assert.ok(app.querySelector('.agent-running-time').textContent.includes('Running'));
    } finally {
      unmount?.();
      unmountCallbacks.delete(unmount);
    }
  });

  it('shows empty state when no agents are running', async () => {
    global.fetch = async () => jsonResponse([]);

    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);
    unmountCallbacks.add(unmount);

    try {
      assert.ok(app.textContent.includes('No agents running. The swarm rests.'));
    } finally {
      unmount?.();
      unmountCallbacks.delete(unmount);
    }
  });

  it('applies SSE updates to cards in real time', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);
    unmountCallbacks.add(unmount);

    try {
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
    } finally {
      unmount?.();
      unmountCallbacks.delete(unmount);
    }
  });
});
