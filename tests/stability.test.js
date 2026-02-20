import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert';
import EventEmitter from 'node:events';
import { CacheService } from '../services/cache-service.js';
import SSEService from '../services/sse-service.js';
import { createHandleTracker } from './setup.js';

const handles = createHandleTracker();

after(async () => {
  await handles.cleanup();
});

describe('Stability: Cache under load', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheService({ defaultTtlMs: 200, maxEntries: 50 });
  });

  it('should handle rapid concurrent getOrFetch calls', async () => {
    let fetchCount = 0;
    const fetchFn = async () => {
      fetchCount++;
      await new Promise((r) => setTimeout(r, 10));
      return 'result';
    };

    // 20 concurrent requests for the same key
    const promises = Array.from({ length: 20 }, () =>
      cache.getOrFetch('load-test', fetchFn)
    );

    const results = await Promise.all(promises);
    assert.ok(results.every((r) => r === 'result'), 'All should return result');
    assert.strictEqual(fetchCount, 1, 'Should deduplicate to a single fetch');
  });

  it('should handle many different keys without corruption', async () => {
    const promises = Array.from({ length: 50 }, (_, i) =>
      cache.getOrFetch(`key-${i}`, async () => `value-${i}`)
    );

    const results = await Promise.all(promises);
    for (let i = 0; i < 50; i++) {
      assert.strictEqual(results[i], `value-${i}`);
    }
  });

  it('should handle fetch errors without corrupting cache', async () => {
    let calls = 0;
    const failingFetch = async () => {
      calls++;
      throw new Error('fail');
    };

    // Should fail
    await assert.rejects(() => cache.getOrFetch('err-key', failingFetch));
    assert.strictEqual(calls, 1);

    // Should retry (not stuck in inflight)
    const successFetch = async () => {
      calls++;
      return 'ok';
    };
    const result = await cache.getOrFetch('err-key', successFetch);
    assert.strictEqual(result, 'ok');
    assert.strictEqual(calls, 2);
  });

  it('should evict under capacity without data loss', () => {
    const small = new CacheService({ defaultTtlMs: 60000, maxEntries: 3 });
    small.set('a', 1);
    small.set('b', 2);
    small.set('c', 3);
    small.set('d', 4); // evicts 'a'

    assert.strictEqual(small.get('a'), undefined);
    assert.strictEqual(small.get('b'), 2);
    assert.strictEqual(small.get('c'), 3);
    assert.strictEqual(small.get('d'), 4);
  });
});

describe('Stability: SSE client handling', () => {
  let service;

  beforeEach(async () => {
    const module = await import(`../services/sse-service.js?t=${Date.now()}`);
    const SSEServiceClass = module.default;
    service = handles.trackService(new SSEServiceClass({
      watchFn: () => ({ close() {} }),
      listAgentsFn: async () => [],
      listBeadsFn: async () => [],
      listRunsFn: async () => [],
      getRalphStatusFn: async () => ({
        activeTask: null,
        currentIteration: 0,
        maxIterations: 0,
        prdProgress: { done: 0, total: 0 },
        tasks: []
      }),
      agentPollIntervalMs: 1000000
    }));
  });

  afterEach(() => {
    if (service) service.cleanup();
  });

  it('should handle rapid connect/disconnect cycles', () => {
    for (let i = 0; i < 50; i++) {
      const mockRes = createMockResponse();
      service.addClient(mockRes);
      mockRes.emit('close');
    }
    assert.strictEqual(service.clients.size, 0);
  });

  it('should broadcast to many clients without error', () => {
    const clients = Array.from({ length: 100 }, () => createMockResponse());
    for (const c of clients) service.addClient(c);

    service.broadcast('test', { value: 42 });

    for (const c of clients) {
      assert.strictEqual(c.writes.length, 1);
    }

    // Cleanup
    for (const c of clients) c.emit('close');
    assert.strictEqual(service.clients.size, 0);
  });

  it('should handle mixed failing and healthy clients', () => {
    const healthy = createMockResponse();
    const failing = createMockResponse();
    failing.write = () => { throw new Error('broken pipe'); };

    service.addClient(healthy);
    service.addClient(failing);

    // Should not throw
    service.broadcast('test', { data: 'msg' });

    assert.strictEqual(healthy.writes.length, 1);
    assert.strictEqual(service.clients.size, 1, 'Failing client should be removed');
  });

  it('should stop monitoring and clear watchers cleanly', () => {
    const closedDirs = [];
    const customService = handles.trackService(new SSEService({
      watchFn: (dir) => ({
        close() { closedDirs.push(dir); }
      }),
      listAgentsFn: async () => [],
      listBeadsFn: async () => [],
      listRunsFn: async () => [],
      getRalphStatusFn: async () => ({
        activeTask: null, currentIteration: 0, maxIterations: 0,
        prdProgress: { done: 0, total: 0 }, tasks: []
      }),
      agentPollIntervalMs: 1000000
    }));

    customService.startMonitoring();
    assert.strictEqual(customService.monitoring, true);

    customService.stopMonitoring();
    assert.strictEqual(customService.monitoring, false);
    assert.strictEqual(customService.watchers.length, 0);
    assert.ok(closedDirs.length >= 2, 'Should close watcher handles');

    customService.cleanup();
  });
});

describe('Stability: Graceful shutdown export', () => {
  it('server.js should export app without crashing', async () => {
    const module = await import('../server.js');
    assert.ok(module.default, 'Should export Express app');
    assert.strictEqual(typeof module.default.listen, 'function');
  });
});

function createMockResponse() {
  const res = new EventEmitter();
  res.writes = [];
  res.write = function (data) { this.writes.push(data); };
  return res;
}
