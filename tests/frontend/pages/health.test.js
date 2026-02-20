import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

describe('Health Page', () => {
  let dom, render;

  before(async () => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
      url: 'http://localhost:9000'
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;

    // Stub fetch for api client
    global.fetch = async (url) => ({
      ok: true,
      json: async () => ({
        timestamp: '2026-02-20T10:00:00Z',
        overall: 'healthy',
        process: {
          pid: 1234,
          uptimeMs: 3600000,
          uptimeFormatted: '1h 0m',
          nodeVersion: 'v24.0.0',
          memory: { rss: 50, heapUsed: 30, heapTotal: 60, unit: 'MB' }
        },
        services: [
          { name: 'beads-cli', status: 'ok', latencyMs: 12 },
          { name: 'tmux', status: 'ok', latencyMs: 5 }
        ],
        cache: { size: 3, hits: 10, misses: 2, hitRate: 0.833 }
      })
    });

    const mod = await import('../../../public/js/pages/health.js');
    render = mod.render;
  });

  after(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.fetch;
  });

  it('should render health page HTML', () => {
    const html = render();
    assert.ok(html.includes('Health Dashboard'));
    assert.ok(html.includes('health-content'));
    assert.ok(html.includes('page-health'));
  });
});
