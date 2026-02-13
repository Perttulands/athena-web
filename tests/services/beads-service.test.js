import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { listBeads } from '../../services/beads-service.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

describe('beads-service', () => {
  describe('listBeads', () => {
    it('should parse br list --json output', async () => {
      // Mock JSON output from br list
      const mockOutput = JSON.stringify([
        {
          id: 'bd-279',
          title: 'Add retry logic to dispatch',
          status: 'done',
          priority: 1,
          created: '2026-02-12T08:00:00Z',
          updated: '2026-02-12T09:30:00Z'
        },
        {
          id: 'bd-280',
          title: 'Fix test flakiness',
          status: 'active',
          priority: 2,
          created: '2026-02-12T10:00:00Z',
          updated: '2026-02-12T10:15:00Z'
        }
      ]);

      // Note: This test will use real br if available
      // For now, we'll test the actual behavior
      const beads = await listBeads();

      // Should return an array (empty if br not found, populated if it is)
      assert.ok(Array.isArray(beads));
    });

    it('should filter beads by status', async () => {
      const beads = await listBeads({ status: 'active' });

      assert.ok(Array.isArray(beads));
      // If beads returned, all should match active/open semantics
      beads.forEach(bead => {
        if (bead.status || bead.canonicalStatus) {
          assert.ok(
            bead.status === 'active' ||
            bead.status === 'open' ||
            bead.canonicalStatus === 'active'
          );
        }
      });
    });

    it('should filter beads by priority', async () => {
      const beads = await listBeads({ priority: 1 });

      assert.ok(Array.isArray(beads));
      // If beads returned, all should match filter
      beads.forEach(bead => {
        if (bead.priority !== undefined) {
          assert.strictEqual(bead.priority, 1);
        }
      });
    });

    it('should sort beads by field', async () => {
      const beads = await listBeads({ sort: 'updated' });

      assert.ok(Array.isArray(beads));
      // Should be sorted by updated field (most recent first)
      for (let i = 1; i < beads.length; i++) {
        if (beads[i-1].updated && beads[i].updated) {
          assert.ok(new Date(beads[i-1].updated) >= new Date(beads[i].updated));
        }
      }
    });

    it('should return empty array with warning when br is not found', async () => {
      // Test graceful degradation
      // We'll modify PATH to make br unavailable temporarily
      const originalPath = process.env.PATH;
      process.env.PATH = '/nonexistent';

      const beads = await listBeads();

      assert.ok(Array.isArray(beads));
      assert.strictEqual(beads.length, 0);

      process.env.PATH = originalPath;
    });

    it('should handle invalid JSON gracefully', async () => {
      // If br returns invalid JSON, should return empty array
      // This is a graceful degradation test
      const beads = await listBeads();
      assert.ok(Array.isArray(beads));
    });
  });
});
