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

const RUNS = [
  {
    bead: 'bd-101',
    agent: 'codex',
    model: 'gpt-5',
    started_at: '2026-02-13T09:00:00Z',
    finished_at: '2026-02-13T09:04:00Z',
    duration_seconds: 240,
    exit_code: 0,
    attempt: 1,
    max_retries: 2,
    prompt_hash: 'abc123',
    verification: { tests: 'pass' }
  },
  {
    bead: 'bd-102',
    agent: 'claude',
    model: 'opus',
    started_at: '2026-02-13T08:00:00Z',
    finished_at: '2026-02-13T08:05:00Z',
    duration_seconds: 300,
    exit_code: 1,
    attempt: 2,
    max_retries: 2,
    prompt_hash: 'def456',
    verification: { tests: 'fail' }
  }
];

describe('Chronicle Page', () => {
  let module;
  let fetchCalls;

  beforeEach(async () => {
    const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
      url: 'http://localhost:9000'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;

    fetchCalls = [];

    global.fetch = async (url) => {
      const callUrl = String(url);
      fetchCalls.push(callUrl);

      if (callUrl.includes('/api/runs?status=success')) {
        return jsonResponse([RUNS[0]]);
      }

      return jsonResponse(RUNS);
    };

    module = await import(`../../../public/js/pages/chronicle.js?t=${Date.now()}`);
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.fetch;
  });

  it('renders run cards and stats summary', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    assert.strictEqual(app.querySelectorAll('.run-card').length, 2);
    assert.strictEqual(app.querySelector('[data-stat-id="runs-total"] .stat-value').textContent, '2');
    assert.strictEqual(app.querySelector('[data-stat-id="runs-success-rate"] .stat-value').textContent, '50%');

    unmount?.();
  });

  it('filters by status and refetches runs', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    const status = app.querySelector('#chronicle-filter-status');
    status.value = 'success';
    status.dispatchEvent(new window.Event('change', { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.ok(fetchCalls.some((url) => url.includes('/api/runs?status=success')));
    assert.strictEqual(app.querySelectorAll('.run-card').length, 1);

    unmount?.();
  });

  it('expands and collapses run detail cards', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    const card = app.querySelector('.run-card');
    card.click();

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.ok(app.querySelector('.run-card-details'));
    assert.ok(app.textContent.includes('Prompt Hash'));

    unmount?.();
  });
});
