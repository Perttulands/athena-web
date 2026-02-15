import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ArtifactWatchService } from '../../services/artifact-watch-service.js';

describe('ArtifactWatchService', () => {
  let tmpDir;
  let artifactDir;
  let inboxDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-watch-'));
    artifactDir = path.join(tmpDir, 'artifacts');
    inboxDir = path.join(tmpDir, 'inbox');
    await fs.mkdir(artifactDir, { recursive: true });
    await fs.mkdir(path.join(inboxDir, 'incoming'), { recursive: true });
    await fs.mkdir(path.join(inboxDir, 'processing'), { recursive: true });
    await fs.mkdir(path.join(inboxDir, 'done'), { recursive: true });
    await fs.mkdir(path.join(inboxDir, 'failed'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('emits artifact_update on file change', async () => {
    const events = [];
    const mockSSE = {
      broadcast(type, data) {
        events.push({ type, data });
      }
    };

    const watcher = new ArtifactWatchService({
      sseService: mockSSE,
      debounceMs: 50
    });

    watcher.start(
      [{ alias: 'test', path: artifactDir }],
      ''
    );
    await watcher.ready();

    await fs.writeFile(path.join(artifactDir, 'test.md'), 'hello');
    await new Promise((resolve) => setTimeout(resolve, 800));

    watcher.stop();

    const artifactEvents = events.filter((e) => e.type === 'artifact_update');
    assert.ok(artifactEvents.length > 0, 'should emit artifact_update');
    assert.strictEqual(artifactEvents[0].data.source, 'artifact');
    assert.strictEqual(artifactEvents[0].data.root, 'test');
    assert.strictEqual(artifactEvents[0].data.eventType, 'add');
    assert.ok(artifactEvents[0].data.ts, 'has timestamp');
  });

  it('emits inbox_update on file change in inbox subdirectory', async () => {
    const events = [];
    const mockSSE = {
      broadcast(type, data) {
        events.push({ type, data });
      }
    };

    const watcher = new ArtifactWatchService({
      sseService: mockSSE,
      debounceMs: 50
    });

    watcher.start([], inboxDir);
    await watcher.ready();

    await fs.writeFile(path.join(inboxDir, 'incoming', 'note.txt'), 'test');
    await new Promise((resolve) => setTimeout(resolve, 800));

    watcher.stop();

    const inboxEvents = events.filter((e) => e.type === 'inbox_update');
    assert.ok(inboxEvents.length > 0, 'should emit inbox_update');
    assert.strictEqual(inboxEvents[0].data.source, 'inbox');
    assert.strictEqual(inboxEvents[0].data.root, 'incoming');
  });

  it('debounces rapid changes', async () => {
    const events = [];
    const mockSSE = {
      broadcast(type, data) {
        events.push({ type, data });
      }
    };

    const watcher = new ArtifactWatchService({
      sseService: mockSSE,
      debounceMs: 200
    });

    watcher.start([{ alias: 'debounce-test', path: artifactDir }], '');
    await watcher.ready();

    const filePath = path.join(artifactDir, 'rapid.md');
    await fs.writeFile(filePath, 'v1');
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fs.writeFile(filePath, 'v2');
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fs.writeFile(filePath, 'v3');

    await new Promise((resolve) => setTimeout(resolve, 800));

    watcher.stop();

    const artifactEvents = events.filter((e) => e.type === 'artifact_update');
    assert.ok(artifactEvents.length <= 3, `debounced to ${artifactEvents.length} events`);
    assert.ok(artifactEvents.length >= 1, 'at least one event emitted');
  });

  it('cleans up watchers on stop', async () => {
    const watcher = new ArtifactWatchService({
      sseService: { broadcast() {} },
      debounceMs: 50
    });

    watcher.start(
      [{ alias: 'cleanup', path: artifactDir }],
      inboxDir
    );

    assert.ok(watcher.watchers.length > 0, 'has active watchers');
    assert.ok(watcher.started, 'marked as started');

    watcher.stop();

    assert.strictEqual(watcher.watchers.length, 0, 'watchers cleared');
    assert.strictEqual(watcher.started, false, 'marked as stopped');
    assert.strictEqual(watcher.timers.size, 0, 'timers cleared');
  });

  it('handles missing directories gracefully', () => {
    const watcher = new ArtifactWatchService({
      sseService: { broadcast() {} },
      debounceMs: 50
    });

    watcher.start(
      [{ alias: 'missing', path: '/nonexistent/path/that/does/not/exist' }],
      ''
    );

    watcher.stop();
  });
});
