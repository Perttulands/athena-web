import { describe, it } from 'node:test';
import assert from 'node:assert';
import { toTimelineEvent, formatDuration } from '../../services/timeline-service.js';

describe('timeline-service', () => {
  describe('toTimelineEvent', () => {
    it('should transform a successful run', () => {
      const run = {
        bead: 'bd-100',
        agent: 'agent-bd-100',
        started_at: '2026-02-19T10:00:00Z',
        ended_at: '2026-02-19T10:05:00Z',
        exit_code: 0
      };

      const event = toTimelineEvent(run);

      assert.strictEqual(event.bead, 'bd-100');
      assert.strictEqual(event.type, 'success');
      assert.strictEqual(event.durationMs, 5 * 60 * 1000);
      assert.strictEqual(event.durationFormatted, '5m');
      assert.strictEqual(event.exitCode, 0);
    });

    it('should transform a failed run', () => {
      const run = {
        bead: 'bd-101',
        started_at: '2026-02-19T10:00:00Z',
        exit_code: 1,
        verification: { lint: 'pass', tests: 'fail' }
      };

      const event = toTimelineEvent(run);

      assert.strictEqual(event.type, 'failure');
      assert.ok(event.message.includes('failed'));
      assert.ok(event.message.includes('lint: pass'));
      assert.ok(event.message.includes('tests: fail'));
    });

    it('should handle missing end time with duration_seconds', () => {
      const run = {
        bead: 'bd-102',
        started_at: '2026-02-19T10:00:00Z',
        duration_seconds: 120,
        exit_code: 0
      };

      const event = toTimelineEvent(run);
      assert.strictEqual(event.durationMs, 120000);
      assert.strictEqual(event.durationFormatted, '2m');
    });

    it('should handle missing timestamps', () => {
      const event = toTimelineEvent({ exit_code: 0 });
      assert.strictEqual(event.startedAt, null);
      assert.strictEqual(event.durationMs, null);
      assert.strictEqual(event.durationFormatted, null);
    });
  });

  describe('formatDuration', () => {
    it('should format seconds', () => {
      assert.strictEqual(formatDuration(45000), '45s');
    });

    it('should format minutes', () => {
      assert.strictEqual(formatDuration(180000), '3m');
    });

    it('should format minutes and seconds', () => {
      assert.strictEqual(formatDuration(195000), '3m 15s');
    });

    it('should format hours', () => {
      assert.strictEqual(formatDuration(7200000), '2h');
    });

    it('should format hours and minutes', () => {
      assert.strictEqual(formatDuration(5400000), '1h 30m');
    });

    it('should return null for null input', () => {
      assert.strictEqual(formatDuration(null), null);
    });
  });
});
