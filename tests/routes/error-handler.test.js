// Tests for error handling middleware
import { describe, it, before } from 'node:test';
import { assert, canListen } from '../setup.js';

describe('Error Handling Middleware', () => {
  let app;
  let socketsAllowed = true;

  before(async () => {
    const server = await import('../../server.js');
    app = server.default;
    socketsAllowed = await canListen();
  });

  it('should return 404 JSON for unknown API routes', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/api/nonexistent`);

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.headers.get('content-type'), 'application/json; charset=utf-8');
    const json = await res.json();
    assert.strictEqual(json.error, 'Not found');
    assert.strictEqual(json.status, 404);

    server.close();
  });

  it('should catch sync errors and return 500 JSON', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/api/test-sync-error`);

    assert.strictEqual(res.status, 500);
    const json = await res.json();
    assert.strictEqual(json.error, 'Sync error test');
    assert.strictEqual(json.status, 500);

    server.close();
  });

  it('should catch async errors and return 500 JSON', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/api/test-async-error`);

    assert.strictEqual(res.status, 500);
    const json = await res.json();
    assert.strictEqual(json.error, 'Async error test');
    assert.strictEqual(json.status, 500);

    server.close();
  });

  it('should handle errors with custom status codes', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/api/test-custom-error`);

    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.error, 'Custom error test');
    assert.strictEqual(json.status, 400);

    server.close();
  });
});
