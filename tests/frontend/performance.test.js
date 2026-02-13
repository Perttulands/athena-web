import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import app from '../../server.js';
import { canListen } from '../setup.js';

describe('Performance Optimizations', () => {
  it('uses dynamic imports for route-level lazy loading', async () => {
    const appJs = await readFile('public/js/app.js', 'utf8');
    assert.ok(appJs.includes("() => import('./pages/oracle.js')"));
    assert.ok(appJs.includes("() => import('./pages/beads.js')"));
    assert.ok(appJs.includes("() => import('./pages/agents.js')"));
  });

  it('applies short-lived client cache for repeated GET calls', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost:9000'
    });

    global.window = dom.window;
    global.document = dom.window.document;

    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return { ok: true };
        }
      };
    };

    const api = (await import(`../../public/js/api.js?t=${Date.now()}`)).default;
    api.clearCache();

    await api.get('/status');
    await api.get('/status');

    assert.strictEqual(calls, 1);

    delete global.window;
    delete global.document;
    delete global.fetch;
  });

  it('returns compression-friendly headers with gzip support middleware', async (t) => {
    if (!(await canListen())) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://localhost:${port}/api/status`, {
      headers: {
        'Accept-Encoding': 'gzip'
      }
    });

    assert.ok(response.headers.get('vary')?.includes('Accept-Encoding'));
    server.close();
  });
});
