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

describe('Scrolls Page Browser', () => {
  let module;
  let dom;

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
      url: 'http://localhost:9000'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;

    global.fetch = async (url) => {
      if (String(url).includes('/api/docs/README.md')) {
        return jsonResponse({ path: 'README.md', content: '# Welcome\nAthena docs' });
      }

      if (String(url).includes('/api/docs/docs/guide.md')) {
        return jsonResponse({ path: 'docs/guide.md', content: '## Guide\n- step one' });
      }

      if (String(url).includes('/api/docs')) {
        return jsonResponse({
          tree: [
            { path: 'README.md', type: 'file' },
            {
              path: 'docs',
              type: 'dir',
              children: [
                { path: 'docs/guide.md', type: 'file' }
              ]
            }
          ]
        });
      }

      return jsonResponse({});
    };

    module = await import(`../../../public/js/pages/scrolls.js?t=${Date.now()}`);
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.fetch;
  });

  it('renders file tree and loads selected file content', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    assert.ok(app.textContent.includes('README.md'));
    assert.ok(app.querySelector('.markdown-body'));
    assert.ok(app.textContent.includes('Welcome'));

    const guide = app.querySelector('[data-file-path="docs/guide.md"]');
    guide.click();

    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.ok(app.textContent.includes('Guide'));
    assert.ok(app.querySelector('#scrolls-breadcrumb').textContent.includes('docs/guide.md'));

    unmount?.();
  });

  it('supports mobile tree toggle', async () => {
    const app = document.querySelector('#app');
    app.innerHTML = module.render();
    const unmount = await module.mount(app);

    const sidebar = app.querySelector('#scrolls-sidebar');
    const toggle = app.querySelector('#scrolls-tree-toggle');

    assert.strictEqual(sidebar.classList.contains('open'), false);
    toggle.click();
    assert.strictEqual(sidebar.classList.contains('open'), true);

    unmount?.();
  });
});
