import { describe, it } from 'node:test';
import assert from 'node:assert';
import { toTapestryNode, STATUS_COLORS, PRIORITY_SIZES } from '../../services/tapestry-service.js';

describe('tapestry-service', () => {
  describe('toTapestryNode', () => {
    it('should transform a bead into a tapestry node', () => {
      const bead = {
        id: 'bd-100',
        title: 'Fix login bug',
        status: 'open',
        canonicalStatus: 'active',
        priority: 1,
        created: '2026-02-18T10:00:00Z',
        updated: '2026-02-19T12:00:00Z'
      };

      const node = toTapestryNode(bead);

      assert.strictEqual(node.id, 'bd-100');
      assert.strictEqual(node.title, 'Fix login bug');
      assert.strictEqual(node.status, 'open');
      assert.strictEqual(node.canonicalStatus, 'active');
      assert.strictEqual(node.color, STATUS_COLORS.active);
      assert.strictEqual(node.priority, 1);
      assert.strictEqual(node.size, 'lg');
    });

    it('should handle P2 and P3 priorities', () => {
      const p2 = toTapestryNode({ canonicalStatus: 'todo', priority: 2 });
      assert.strictEqual(p2.size, 'md');

      const p3 = toTapestryNode({ canonicalStatus: 'done', priority: 3 });
      assert.strictEqual(p3.size, 'sm');
    });

    it('should default to unknown color for unrecognized status', () => {
      const node = toTapestryNode({ canonicalStatus: 'bizarre', priority: 1 });
      assert.strictEqual(node.color, STATUS_COLORS.unknown);
    });

    it('should default to sm size for missing priority', () => {
      const node = toTapestryNode({ canonicalStatus: 'active' });
      assert.strictEqual(node.size, 'sm');
    });

    it('should include assignee and tags', () => {
      const node = toTapestryNode({
        canonicalStatus: 'active',
        owner: 'ralph',
        tags: ['frontend', 'urgent']
      });
      assert.strictEqual(node.assignee, 'ralph');
      assert.deepStrictEqual(node.tags, ['frontend', 'urgent']);
    });
  });

  describe('STATUS_COLORS', () => {
    it('should have colors for all canonical statuses', () => {
      assert.ok(STATUS_COLORS.todo);
      assert.ok(STATUS_COLORS.active);
      assert.ok(STATUS_COLORS.done);
      assert.ok(STATUS_COLORS.failed);
      assert.ok(STATUS_COLORS.unknown);
    });
  });

  describe('PRIORITY_SIZES', () => {
    it('should map 1=lg, 2=md, 3=sm', () => {
      assert.strictEqual(PRIORITY_SIZES[1], 'lg');
      assert.strictEqual(PRIORITY_SIZES[2], 'md');
      assert.strictEqual(PRIORITY_SIZES[3], 'sm');
    });
  });
});
