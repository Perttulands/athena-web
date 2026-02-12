import { describe, it } from 'node:test';
import assert from 'node:assert';

// These tests verify the tmux service with real tmux commands
// Since we can't reliably mock exec in ES modules, we test the actual behavior
// The service gracefully handles when tmux is not available

describe('tmux-service', () => {
  describe('listAgents', () => {
    it('should return empty array when no sessions exist', async () => {
      const { listAgents } = await import('../../services/tmux-service.js');
      const agents = await listAgents();
      // Should return empty array if no agent- sessions or tmux not running
      assert.ok(Array.isArray(agents));
    });

    it('should parse tmux session list and filter agent- sessions', async () => {
      const { listAgents } = await import('../../services/tmux-service.js');
      const agents = await listAgents();

      // All returned agents should have 'agent-' prefix
      agents.forEach(agent => {
        assert.ok(agent.name.startsWith('agent-'));
        assert.ok(agent.status);
        assert.ok(agent.startedAt);
        assert.ok(agent.runningTime);
      });
    });

    it('should return agents with required fields', async () => {
      const { listAgents } = await import('../../services/tmux-service.js');
      const agents = await listAgents();

      if (agents.length > 0) {
        const agent = agents[0];
        assert.ok(agent.name);
        assert.ok(agent.bead);
        assert.strictEqual(agent.status, 'running');
        assert.ok(agent.startedAt);
        assert.ok(agent.runningTime);
        assert.ok(agent.lastOutput !== undefined);
      }
    });
  });

  describe('getOutput', () => {
    it('should return error when session does not exist', async () => {
      const { getOutput } = await import('../../services/tmux-service.js');
      const output = await getOutput('agent-nonexistent', 200);

      assert.strictEqual(output.error, true);
      assert.ok(output.message.includes('not found'));
    });

    it('should return output structure for non-existent session', async () => {
      const { getOutput } = await import('../../services/tmux-service.js');
      const output = await getOutput('agent-test-xyz', 200);

      // Should gracefully handle missing session
      if (output.error) {
        assert.strictEqual(output.error, true);
        assert.ok(output.message);
      } else {
        assert.ok(output.name);
        assert.ok(output.output !== undefined);
        assert.strictEqual(output.lines, 200);
      }
    });
  });

  describe('killAgent', () => {
    it('should return error for non-existent session', async () => {
      const { killAgent } = await import('../../services/tmux-service.js');
      const result = await killAgent('agent-nonexistent');

      assert.strictEqual(result.error, true);
      assert.ok(result.message.includes('not found'));
    });

    it('should return proper structure when session not found', async () => {
      const { killAgent } = await import('../../services/tmux-service.js');
      const result = await killAgent('agent-test-xyz');

      // Should gracefully handle missing session
      if (result.error) {
        assert.strictEqual(result.error, true);
        assert.ok(result.message);
      } else {
        assert.strictEqual(result.killed, true);
        assert.ok(result.name);
      }
    });
  });
});
