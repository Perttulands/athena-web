import { describe, it, before } from 'node:test';
import assert from 'node:assert';

describe('Agents Routes', () => {
  let app;

  before(async () => {
    const server = await import('../../server.js');
    app = server.default;
  });

  describe('GET /api/agents', () => {
    it('should return list of agent sessions', async () => {
      const server = app.listen(0);
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/agents`);

      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok(Array.isArray(data));

      server.close();
    });

    it('should return agent objects with required fields', async () => {
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
    it('should return 404 for non-existent session', async () => {
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
    it('should return error for non-existent session', async () => {
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
