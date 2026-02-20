import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getProcessHealth, formatUptime } from '../../services/health-service.js';

describe('health-service', () => {
  describe('getProcessHealth', () => {
    it('should return process metrics', () => {
      const health = getProcessHealth();

      assert.ok(typeof health.pid === 'number');
      assert.ok(health.uptimeMs >= 0);
      assert.ok(typeof health.uptimeFormatted === 'string');
      assert.ok(health.nodeVersion.startsWith('v'));
      assert.ok(typeof health.memory.rss === 'number');
      assert.ok(typeof health.memory.heapUsed === 'number');
      assert.ok(typeof health.memory.heapTotal === 'number');
      assert.strictEqual(health.memory.unit, 'MB');
    });
  });

  describe('formatUptime', () => {
    it('should format seconds', () => {
      assert.strictEqual(formatUptime(30000), '30s');
    });

    it('should format minutes and seconds', () => {
      assert.strictEqual(formatUptime(150000), '2m 30s');
    });

    it('should format hours and minutes', () => {
      assert.strictEqual(formatUptime(5400000), '1h 30m');
    });

    it('should format days and hours', () => {
      assert.strictEqual(formatUptime(90000000), '1d 1h');
    });
  });
});
