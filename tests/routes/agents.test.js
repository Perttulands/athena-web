import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { canListen } from '../setup.js';

describe('Agents Routes', () => {
  let app;
  let socketsAllowed = true;

  before(async () => {
    const server = await import('../../server.js');
    app = server.default;
    socketsAllowed = await canListen();
  });

  describe('GET /api/agents', () => {
    it('should return list of agent sessions', async (t) => {
      if (!socketsAllowed) {
        t.skip('Local sockets are blocked in this environment');
        return;
      }

      const server = app.listen(0);
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/agents`);

      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok(Array.isArray(data));

      server.close();
    });

    it('should return agent objects with required fields', async (t) => {
      if (!socketsAllowed) {
        t.skip('Local sockets are blocked in this environment');
        return;
      }

      const server = app.listen(0);
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/agents`);

      const data = await response.json();
      if (data.length > 0) {
        const agent = data[0];
        assert.ok(agent.name);
        assert.ok(agent.status);
        assert.ok(agent.startedAt);
        assert.ok(agent.runningTime);
        assert.ok(agent.lastOutput !== undefined);
      }

      server.close();
    });
  });

  describe('GET /api/agents/:name/output', () => {
    it('should return 404 for non-existent session', async (t) => {
      if (!socketsAllowed) {
        t.skip('Local sockets are blocked in this environment');
        return;
      }

      const server = app.listen(0);
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/agents/agent-nonexistent-xyz/output`);

      assert.strictEqual(response.status, 404);

      const data = await response.json();
      assert.strictEqual(data.error, true);

      server.close();
    });
  });

  describe('POST /api/agents/:name/kill', () => {
    it('should reject invalid session names', async (t) => {
      if (!socketsAllowed) {
        t.skip('Local sockets are blocked in this environment');
        return;
      }

      const server = app.listen(0);
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/agents/not-valid/kill`, {
        method: 'POST'
      });

      assert.strictEqual(response.status, 400);
      server.close();
    });

    it('should return error for non-existent session', async (t) => {
      if (!socketsAllowed) {
        t.skip('Local sockets are blocked in this environment');
        return;
      }

      const server = app.listen(0);
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/agents/agent-nonexistent-xyz/kill`, {
        method: 'POST'
      });

      assert.strictEqual(response.status, 404);

      const data = await response.json();
      assert.strictEqual(data.error, true);

      server.close();
    });
  });
});
