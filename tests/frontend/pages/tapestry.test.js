import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

describe('Tapestry Page', () => {
  let dom, render;

  before(async () => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
      url: 'http://localhost:9000'
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        timestamp: '2026-02-20T10:00:00Z',
        total: 5,
        summary: { todo: 2, active: 1, done: 2, failed: 0 },
        groups: { todo: [], active: [], done: [], failed: [] },
        statusColors: { todo: '#6b7280', active: '#3b82f6', done: '#22c55e', failed: '#ef4444' }
      })
    });

    const mod = await import('../../../public/js/pages/tapestry.js');
    render = mod.render;
  });

  after(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.fetch;
  });

  it('should render tapestry page HTML', () => {
    const html = render();
    assert.ok(html.includes('Tapestry'));
    assert.ok(html.includes('tapestry-content'));
    assert.ok(html.includes('page-tapestry'));
  });

  it('should render with mobile-first class names', () => {
    const html = render();
    assert.ok(html.includes('page-shell'));
    assert.ok(html.includes('container'));
  });
});
