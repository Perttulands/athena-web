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

describe('Beads Detail Sheet', () => {
  let module;

  beforeEach(async () => {
    const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
      url: 'http://localhost:9000'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

    global.fetch = async (url) => {
      if (String(url).includes('/api/runs?bead=bd-100')) {
        return jsonResponse([
          {
            bead: 'bd-100',
            agent: 'codex',
            started_at: '2026-02-13T12:00:00Z',
            duration_seconds: 120,
            exit_code: 0
          }
        ]);
      }

      return jsonResponse([
        { id: 'bd-100', title: 'Open detail', status: 'active', priority: 1, created: '2026-02-11T08:00:00Z', updated: '2026-02-12T08:00:00Z' }
      ]);
    };

    module = await import(`../../../public/js/pages/beads.js?t=${Date.now()}`);
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.fetch;
    delete global.requestAnimationFrame;
  });

  it('opens bottom sheet on card click and renders linked runs', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    await module.mount(app);

    const card = app.querySelector('.bead-card');
    card.click();

    await new Promise((resolve) => setTimeout(resolve, 80));

    const sheet = document.querySelector('.bottom-sheet-overlay');
    assert.ok(sheet);
    assert.ok(sheet.classList.contains('open'));

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.ok(sheet.textContent.includes('Linked Runs'));
    assert.ok(sheet.textContent.includes('codex'));
  });

  it('closes sheet on backdrop click', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    await module.mount(app);

    app.querySelector('.bead-card').click();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const backdrop = document.querySelector('.bottom-sheet-backdrop');
    backdrop.click();

    await new Promise((resolve) => setTimeout(resolve, 260));

    assert.strictEqual(document.querySelector('.bottom-sheet-overlay'), null);
    assert.strictEqual(document.body.classList.contains('sheet-open'), false);
  });
});
