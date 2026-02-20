import { describe, it } from 'node:test';
import assert from 'node:assert';
import { toTimelineEvent, formatDuration, beadDurationBreakdown, groupByDay } from '../../services/timeline-service.js';

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

  describe('groupByDay', () => {
    it('should group events by date', () => {
      const events = [
        { startedAt: '2026-02-19T10:00:00Z', type: 'success' },
        { startedAt: '2026-02-19T14:00:00Z', type: 'failure' },
        { startedAt: '2026-02-20T08:00:00Z', type: 'success' }
      ];
      const groups = groupByDay(events);
      assert.strictEqual(groups['2026-02-19'].length, 2);
      assert.strictEqual(groups['2026-02-20'].length, 1);
    });

    it('should handle events with no startedAt', () => {
      const events = [{ type: 'success' }];
      const groups = groupByDay(events);
      assert.strictEqual(groups['unknown'].length, 1);
    });
  });

  describe('beadDurationBreakdown', () => {
    it('should compute per-bead duration stats', () => {
      const events = [
        { bead: 'bd-1', durationMs: 60000, type: 'success' },
        { bead: 'bd-1', durationMs: 120000, type: 'success' },
        { bead: 'bd-2', durationMs: 30000, type: 'failure' }
      ];
      const breakdown = beadDurationBreakdown(events);
      assert.strictEqual(breakdown.length, 2);

      const bd1 = breakdown.find(b => b.bead === 'bd-1');
      assert.strictEqual(bd1.totalMs, 180000);
      assert.strictEqual(bd1.runs, 2);
      assert.strictEqual(bd1.successRate, 1);
      assert.strictEqual(bd1.avgMs, 90000);

      const bd2 = breakdown.find(b => b.bead === 'bd-2');
      assert.strictEqual(bd2.totalMs, 30000);
      assert.strictEqual(bd2.successRate, 0);
    });

    it('should skip events without bead or duration', () => {
      const events = [
        { bead: null, durationMs: 60000, type: 'success' },
        { bead: 'bd-1', durationMs: null, type: 'success' },
        { bead: 'bd-1', durationMs: 5000, type: 'success' }
      ];
      const breakdown = beadDurationBreakdown(events);
      assert.strictEqual(breakdown.length, 1);
      assert.strictEqual(breakdown[0].runs, 1);
    });

    it('should sort by total duration descending', () => {
      const events = [
        { bead: 'short', durationMs: 1000, type: 'success' },
        { bead: 'long', durationMs: 99000, type: 'success' }
      ];
      const breakdown = beadDurationBreakdown(events);
      assert.strictEqual(breakdown[0].bead, 'long');
    });
  });
});
