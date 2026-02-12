// Tests for error handling middleware
import { describe, it, before } from 'node:test';
import { assert } from '../setup.js';

describe('Error Handling Middleware', () => {
  let app;

  before(async () => {
    const server = await import('../../server.js');
    app = server.default;
  });

  it('should return 404 JSON for unknown API routes', async () => {
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

  it('should catch sync errors and return 500 JSON', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/api/test-sync-error`);

    assert.strictEqual(res.status, 500);
    const json = await res.json();
    assert.strictEqual(json.error, 'Sync error test');
    assert.strictEqual(json.status, 500);

    server.close();
  });

  it('should catch async errors and return 500 JSON', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/api/test-async-error`);

    assert.strictEqual(res.status, 500);
    const json = await res.json();
    assert.strictEqual(json.error, 'Async error test');
    assert.strictEqual(json.status, 500);

    server.close();
  });

  it('should handle errors with custom status codes', async () => {
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
