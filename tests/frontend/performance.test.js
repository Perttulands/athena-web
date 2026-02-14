import { describe, it, afterEach, after } from 'node:test';
import assert from 'node:assert';
import { request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import app from '../../server.js';
import { canListen } from '../setup.js';

const trackedDoms = new Set();
const trackedServers = new Set();
const originalWindow = global.window;
const originalDocument = global.document;
const originalFetch = global.fetch;

function restoreGlobal(name, value) {
  if (value === undefined) {
    delete global[name];
    return;
  }
  global[name] = value;
}

function closeServer(server) {
  if (!server || !server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function cleanupTrackedHandles() {
  for (const dom of trackedDoms) {
    dom?.window?.close();
  }
  trackedDoms.clear();

  await Promise.all([...trackedServers].map((server) => closeServer(server)));
  trackedServers.clear();

  restoreGlobal('window', originalWindow);
  restoreGlobal('document', originalDocument);
  restoreGlobal('fetch', originalFetch);
}

describe('Performance Optimizations', () => {
  afterEach(async () => {
    await cleanupTrackedHandles();
  });

  after(async () => {
    await cleanupTrackedHandles();
  });

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
    trackedDoms.add(dom);

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
  });

  it('returns compression-friendly headers with gzip support middleware', async (t) => {
    if (!(await canListen())) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    trackedServers.add(server);

    try {
      const port = server.address().port;
      const headers = await new Promise((resolve, reject) => {
        const req = httpRequest({
          host: '127.0.0.1',
          port,
          path: '/api/status',
          method: 'GET',
          headers: {
            'Accept-Encoding': 'gzip'
          }
        }, (res) => {
          res.resume();
          res.on('end', () => resolve(res.headers));
        });

        req.on('error', reject);
        req.end();
      });

      assert.ok(String(headers.vary || '').includes('Accept-Encoding'));
    } finally {
      trackedServers.delete(server);
      await closeServer(server);
    }
  });
});
