import { describe, it, before } from 'node:test';
import { assert, canListen } from '../setup.js';

describe('GET /api/beads', () => {
  let app;
  let socketsAllowed = true;

  before(async () => {
    const server = await import('../../server.js');
    app = server.default;
    socketsAllowed = await canListen();
  });

  it('should return beads array', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/beads`);

    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.ok(Array.isArray(data));

    server.close();
  });

  it('should filter beads by status query param', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/beads?status=active`);

    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.ok(Array.isArray(data));

    // All returned beads should have status=active (if any returned)
    data.forEach(bead => {
      if (bead.status) {
        assert.strictEqual(bead.status, 'active');
      }
    });

    server.close();
  });

  it('should filter beads by priority query param', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/beads?priority=1`);

    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.ok(Array.isArray(data));

    // All returned beads should have priority=1 (if any returned)
    data.forEach(bead => {
      if (bead.priority !== undefined) {
        assert.strictEqual(bead.priority, 1);
      }
    });

    server.close();
  });

  it('should sort beads by query param', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/beads?sort=updated`);

    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.ok(Array.isArray(data));

    // Should be sorted by updated field
    for (let i = 1; i < data.length; i++) {
      if (data[i-1].updated && data[i].updated) {
        assert.ok(new Date(data[i-1].updated) >= new Date(data[i].updated));
      }
    }

    server.close();
  });

  it('should combine multiple query params', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/beads?status=done&sort=created`);

    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.ok(Array.isArray(data));

    server.close();
  });
});
