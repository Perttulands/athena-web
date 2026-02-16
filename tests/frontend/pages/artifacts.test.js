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

describe('Artifacts Page', () => {
  let module;

  beforeEach(async () => {
    const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
      url: 'http://localhost:9000'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;

    global.fetch = async (url) => {
      const requestUrl = String(url);

      if (requestUrl.includes('/api/artifacts/results/bd-1nn')) {
        return jsonResponse({
          artifact: {
            id: 'bd-1nn',
            title: 'bd-1nn',
            status: 'done',
            agent: 'codex',
            bead: 'bd-1nn',
            startedAt: '2026-02-13T09:00:00Z',
            finishedAt: '2026-02-13T09:10:00Z',
            exitCode: 0
          },
          markdown: [
            '# Artifact bd-1nn',
            '',
            '## Code Diff',
            '',
            '```diff',
            '+const answer = 42;',
            '-const answer = 0;',
            '```'
          ].join('\n')
        });
      }

      if (requestUrl.includes('/api/artifacts/results')) {
        return jsonResponse({
          artifacts: [
            {
              id: 'bd-1nn',
              title: 'bd-1nn',
              status: 'done',
              agent: 'codex',
              finishedAt: '2026-02-13T09:10:00Z',
              summaryPreview: 'Implemented artifact viewer.'
            }
          ]
        });
      }

      return jsonResponse({});
    };

    module = await import(`../../../public/js/pages/artifacts.js?t=${Date.now()}`);
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.fetch;
  });

  it('renders artifact list from API', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();

    const unmount = await module.mount(app, { path: '/artifacts', params: {} });
    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.ok(app.textContent.includes('Artifacts'));
    assert.ok(app.textContent.includes('bd-1nn'));
    assert.ok(app.textContent.includes('Implemented artifact viewer.'));

    unmount?.();
  });

  it('loads artifact detail route and applies code highlighting tokens', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();

    const unmount = await module.mount(app, {
      path: '/artifacts/bd-1nn',
      params: { id: 'bd-1nn' }
    });

    await new Promise((resolve) => setTimeout(resolve, 80));

    const viewer = app.querySelector('#artifacts-viewer');
    assert.ok(viewer.textContent.includes('Code Diff'));
    assert.ok(viewer.querySelector('.code-token-add'));
    assert.ok(viewer.querySelector('.code-token-del'));

    unmount?.();
  });
});
