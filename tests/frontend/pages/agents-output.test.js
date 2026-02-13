import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
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
    status: 200,
    async json() {
      return payload;
    }
  };
}

describe('Agents Output View', () => {
  let module;
  let fetchCalls;

  beforeEach(async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="status-indicator"></div><main id="app"></main></body></html>', {
      url: 'http://localhost:9000'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.EventSource = MockEventSource;

    fetchCalls = [];

    global.fetch = async (url, options = {}) => {
      fetchCalls.push({ url: String(url), method: options.method || 'GET' });

      if (String(url).includes('/api/agents/') && String(url).endsWith('/kill')) {
        return jsonResponse({ killed: true, name: 'agent-bd-301' });
      }

      if (String(url).includes('/api/agents/') && String(url).endsWith('/output')) {
        return jsonResponse({
          name: 'agent-bd-301',
          output: Array.from({ length: 5 }, (_, i) => `line ${i + 1}`).join('\n')
        });
      }

      return jsonResponse([
        {
          name: 'agent-bd-301',
          bead: 'bd-301',
          status: 'running',
          startedAt: new Date().toISOString(),
          lastOutput: 'line a\nline b\nline c',
          contextPercent: 52
        }
      ]);
    };

    module = await import(`../../../public/js/pages/agents.js?t=${Date.now()}`);
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.EventSource;
    delete global.fetch;
  });

  it('opens output sheet and fetches latest output', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    app.querySelector('.agent-monitor-card').click();
    await new Promise((resolve) => setTimeout(resolve, 120));

    const sheet = document.querySelector('.bottom-sheet-overlay');
    assert.ok(sheet);
    assert.ok(sheet.textContent.includes('line 5'));
    assert.ok(fetchCalls.some((call) => call.url.includes('/api/agents/agent-bd-301/output')));

    unmount?.();
  });

  it('kills agent through confirm flow and removes card', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    app.querySelector('.agent-monitor-card').click();
    await new Promise((resolve) => setTimeout(resolve, 120));

    const killButton = document.querySelector('.agent-output-kill');
    killButton.click();

    const confirmButton = document.querySelector('.confirm-dialog .btn-danger');
    confirmButton.click();

    await new Promise((resolve) => setTimeout(resolve, 120));

    assert.ok(fetchCalls.some((call) => call.url.includes('/kill') && call.method === 'POST'));
    assert.strictEqual(app.querySelectorAll('.agent-monitor-card').length, 0);

    unmount?.();
  });
});
