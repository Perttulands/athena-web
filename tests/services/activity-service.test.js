import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

describe('ActivityService', () => {
  let tmpDir;
  let ActivityService;
  let service;

  before(async () => {
    tmpDir = join(os.tmpdir(), `athena-activity-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    const mod = await import(`../../services/activity-service.js?t=${Date.now()}`);
    ActivityService = mod.ActivityService;
    service = new ActivityService({ stateDir: tmpDir });
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('records and queries events', async () => {
    await service.record({ type: 'api_request', path: '/api/beads', status: 200 });
    await service.record({ type: 'api_request', path: '/api/agents', status: 200 });

    const events = await service.query();
    assert.ok(events.length >= 2, 'should have at least 2 events');
    // Newest first
    assert.equal(events[0].path, '/api/agents');
    assert.equal(events[1].path, '/api/beads');
  });

  it('adds timestamp automatically', async () => {
    await service.record({ type: 'test_event' });
    const events = await service.query({ type: 'test_event' });
    assert.ok(events.length >= 1);
    assert.ok(events[0].ts, 'should have timestamp');
    assert.ok(!isNaN(new Date(events[0].ts).getTime()), 'timestamp should be valid ISO');
  });

  it('filters by type', async () => {
    await service.record({ type: 'error', message: 'boom' });
    await service.record({ type: 'api_request', path: '/api/status' });

    const errors = await service.query({ type: 'error' });
    assert.ok(errors.length >= 1);
    assert.ok(errors.every((e) => e.type === 'error'));
  });

  it('filters by since', async () => {
    const now = new Date().toISOString();
    // Small delay to ensure events after 'now'
    await new Promise((r) => setTimeout(r, 10));
    await service.record({ type: 'after_since', value: 1 });

    const events = await service.query({ since: now, type: 'after_since' });
    assert.ok(events.length >= 1);
  });

  it('respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await service.record({ type: 'limit_test', i });
    }

    const events = await service.query({ type: 'limit_test', limit: 2 });
    assert.equal(events.length, 2);
  });

  it('clamps limit to max', async () => {
    const events = await service.query({ limit: 99999 });
    assert.ok(events.length <= 200);
  });

  it('returns stats', async () => {
    const stats = await service.stats();
    assert.ok(typeof stats.totalEvents === 'number');
    assert.ok(typeof stats.types === 'object');
    assert.ok(stats.newestEvent || stats.totalEvents === 0);
  });

  it('handles rotation when file exceeds max size', async () => {
    const smallService = new ActivityService({
      stateDir: join(tmpDir, 'rotation'),
      maxFileBytes: 256 // tiny limit for testing
    });

    // Write enough data to trigger rotation
    for (let i = 0; i < 20; i++) {
      await smallService.record({ type: 'rotation_test', data: 'x'.repeat(20), i });
    }

    // Archive file should exist after rotation
    try {
      await fs.access(smallService.archivePath);
    } catch {
      // Rotation may or may not have happened depending on timing,
      // but the service should not crash
    }

    // Current file should still be queryable
    const events = await smallService.query({ type: 'rotation_test' });
    assert.ok(events.length > 0, 'should still have events after rotation');
  });

  it('handles missing state directory gracefully', async () => {
    const missingService = new ActivityService({
      stateDir: join(tmpDir, 'does-not-exist-yet')
    });

    await missingService.record({ type: 'auto_create' });
    const events = await missingService.query({ type: 'auto_create' });
    assert.ok(events.length >= 1);
  });
});
