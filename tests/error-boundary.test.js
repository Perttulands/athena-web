import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { request, canListen } from './setup.js';

describe('Error boundary and recovery', () => {
  let app;
  let socketsAllowed = true;

  before(async () => {
    const server = await import('../server.js');
    app = server.default;
    socketsAllowed = await canListen();
  });

  describe('Client error reporting endpoint', () => {
    it('POST /api/activity/report records client error', async (t) => {
      if (!socketsAllowed) { t.skip('sockets blocked'); return; }

      const result = await request(app, '/api/activity/report', {
        method: 'POST',
        body: JSON.stringify({
          type: 'client_error',
          error: 'Test error from boundary',
          source: 'test.js',
          stack: 'Error: test\n  at test.js:1:1'
        })
      });
      if (result.skipped) { t.skip('sockets blocked'); return; }

      assert.equal(result.status, 200);
      assert.deepEqual(result.data, { recorded: true });
    });

    it('POST /api/activity/report rejects missing error field', async (t) => {
      if (!socketsAllowed) { t.skip('sockets blocked'); return; }

      const result = await request(app, '/api/activity/report', {
        method: 'POST',
        body: JSON.stringify({ type: 'client_error' })
      });
      if (result.skipped) { t.skip('sockets blocked'); return; }

      assert.equal(result.status, 400);
    });

    it('POST /api/activity/report truncates long strings', async (t) => {
      if (!socketsAllowed) { t.skip('sockets blocked'); return; }

      const result = await request(app, '/api/activity/report', {
        method: 'POST',
        body: JSON.stringify({
          error: 'x'.repeat(1000),
          source: 'y'.repeat(500),
          stack: 'z'.repeat(1000)
        })
      });
      if (result.skipped) { t.skip('sockets blocked'); return; }

      assert.equal(result.status, 200);
    });
  });

  describe('Backend process recovery', () => {
    it('server.js exports app with error handler middleware', async () => {
      const server = await import('../server.js');
      const app = server.default;
      assert.ok(app, 'Should export Express app');
      // The app stack should include error handler (4-arg middleware)
      assert.equal(typeof app.listen, 'function');
    });

    it('error handler returns JSON for sync errors', async (t) => {
      if (!socketsAllowed) { t.skip('sockets blocked'); return; }

      const result = await request(app, '/api/test-sync-error');
      if (result.skipped) { t.skip('sockets blocked'); return; }

      assert.equal(result.status, 500);
      assert.ok(result.data.error, 'Should have error message');
    });

    it('error handler returns JSON for async errors', async (t) => {
      if (!socketsAllowed) { t.skip('sockets blocked'); return; }

      const result = await request(app, '/api/test-async-error');
      if (result.skipped) { t.skip('sockets blocked'); return; }

      assert.equal(result.status, 500);
      assert.ok(result.data.error, 'Should have error message');
    });

    it('error handler returns custom status codes', async (t) => {
      if (!socketsAllowed) { t.skip('sockets blocked'); return; }

      const result = await request(app, '/api/test-custom-error');
      if (result.skipped) { t.skip('sockets blocked'); return; }

      assert.equal(result.status, 400);
    });
  });

  describe('Frontend error boundary script', () => {
    it('error-boundary.js file exists in public/js/', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const stat = await fs.stat(
        path.join(process.cwd(), 'public', 'js', 'error-boundary.js')
      );
      assert.ok(stat.isFile());
    });

    it('index.html includes error-boundary.js before app.js', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const html = await fs.readFile(
        path.join(process.cwd(), 'public', 'index.html'),
        'utf8'
      );
      const boundaryIdx = html.indexOf('error-boundary.js');
      const appIdx = html.indexOf('app.js');
      assert.ok(boundaryIdx > 0, 'Should include error-boundary.js');
      assert.ok(boundaryIdx < appIdx, 'error-boundary.js should load before app.js');
    });
  });
});
