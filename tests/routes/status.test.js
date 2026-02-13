import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { canListen } from '../setup.js';

describe('GET /api/status', () => {
  let app;
  let socketsAllowed = true;

  before(async () => {
    const server = await import('../../server.js');
    app = server.default;
    socketsAllowed = await canListen();
  });

  it('returns aggregate dashboard data', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/status`);
    const data = await response.json();

    assert.strictEqual(response.status, 200);
    assert.ok(data.athena);
    assert.ok(data.agents);
    assert.ok(data.beads);
    assert.ok(data.ralph);
    assert.ok(Array.isArray(data.recentActivity));

    server.close();
  });

  it('includes athena status fields', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/status`);
    const data = await response.json();

    assert.ok('status' in data.athena);
    assert.ok('lastMessage' in data.athena);
    assert.ok('lastSeen' in data.athena);

    server.close();
  });

  it('includes agents stats', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/status`);
    const data = await response.json();

    assert.ok(typeof data.agents.running === 'number');
    assert.ok(typeof data.agents.total === 'number');
    assert.ok(typeof data.agents.successRate === 'number');

    server.close();
  });

  it('includes beads stats', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/status`);
    const data = await response.json();

    assert.ok(typeof data.beads.todo === 'number');
    assert.ok(typeof data.beads.active === 'number');
    assert.ok(typeof data.beads.done === 'number');
    assert.ok(typeof data.beads.failed === 'number');

    server.close();
  });

  it('includes ralph stats', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/status`);
    const data = await response.json();

    assert.ok('currentTask' in data.ralph);
    assert.ok('iteration' in data.ralph);
    assert.ok('maxIterations' in data.ralph);
    assert.ok(data.ralph.prdProgress);
    assert.ok(typeof data.ralph.prdProgress.done === 'number');
    assert.ok(typeof data.ralph.prdProgress.total === 'number');

    server.close();
  });
});
