import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

describe('GET /api/runs', () => {
  let app;

  before(async () => {
    // Mock the state directory to be empty for clean testing
    process.env.STATE_PATH = '/tmp/athena-web-test-runs-' + Date.now();

    const server = await import('../../server.js');
    app = server.default;
  });

  it('should return empty array when state directory does not exist', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/runs`);

    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.ok(Array.isArray(data));
    assert.strictEqual(data.length, 0);

    server.close();
  });

  it('should accept query params', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/runs?status=success&agent=claude&date=2026-02-12`);

    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.ok(Array.isArray(data));

    server.close();
  });
});
