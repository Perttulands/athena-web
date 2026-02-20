import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { CacheService } from '../../services/cache-service.js';

describe('CacheService', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheService({ defaultTtlMs: 500, maxEntries: 5 });
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    assert.strictEqual(cache.get('key1'), 'value1');
  });

  it('should return undefined for missing keys', () => {
    assert.strictEqual(cache.get('nonexistent'), undefined);
  });

  it('should expire entries after TTL', async () => {
    cache.set('key1', 'value1', 50); // 50ms TTL
    assert.strictEqual(cache.get('key1'), 'value1');

    await new Promise((r) => setTimeout(r, 80));
    assert.strictEqual(cache.get('key1'), undefined);
  });

  it('should evict oldest entry when at capacity', () => {
    for (let i = 0; i < 5; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    assert.strictEqual(cache.store.size, 5);

    // Adding a 6th should evict key0
    cache.set('key5', 'value5');
    assert.strictEqual(cache.store.size, 5);
    assert.strictEqual(cache.get('key0'), undefined);
    assert.strictEqual(cache.get('key5'), 'value5');
  });

  it('should not evict when updating existing key', () => {
    for (let i = 0; i < 5; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    // Update existing key — should not evict
    cache.set('key0', 'updated');
    assert.strictEqual(cache.store.size, 5);
    assert.strictEqual(cache.get('key0'), 'updated');
    assert.strictEqual(cache.get('key4'), 'value4');
  });

  it('should delete a key', () => {
    cache.set('key1', 'value1');
    cache.delete('key1');
    assert.strictEqual(cache.get('key1'), undefined);
  });

  it('should clear all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    assert.strictEqual(cache.store.size, 0);
    assert.strictEqual(cache.get('key1'), undefined);
  });

  describe('getOrFetch', () => {
    it('should call fetchFn on cache miss', async () => {
      let calls = 0;
      const result = await cache.getOrFetch('key1', async () => {
        calls++;
        return 'fetched';
      });
      assert.strictEqual(result, 'fetched');
      assert.strictEqual(calls, 1);
    });

    it('should return cached value on cache hit', async () => {
      let calls = 0;
      cache.set('key1', 'cached');
      const result = await cache.getOrFetch('key1', async () => {
        calls++;
        return 'fetched';
      });
      assert.strictEqual(result, 'cached');
      assert.strictEqual(calls, 0);
    });

    it('should deduplicate concurrent requests', async () => {
      let calls = 0;
      const fetchFn = async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 50));
        return 'result';
      };

      const [r1, r2, r3] = await Promise.all([
        cache.getOrFetch('key1', fetchFn),
        cache.getOrFetch('key1', fetchFn),
        cache.getOrFetch('key1', fetchFn)
      ]);

      assert.strictEqual(r1, 'result');
      assert.strictEqual(r2, 'result');
      assert.strictEqual(r3, 'result');
      assert.strictEqual(calls, 1, 'fetchFn should only be called once');
    });

    it('should propagate errors and clear inflight', async () => {
      const fetchFn = async () => {
        throw new Error('fetch failed');
      };

      await assert.rejects(
        () => cache.getOrFetch('key1', fetchFn),
        { message: 'fetch failed' }
      );

      // Inflight should be cleared so retry works
      assert.strictEqual(cache.inflight.has('key1'), false);
    });
  });

  describe('stats', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('missing'); // miss

      const s = cache.stats();
      assert.strictEqual(s.hits, 2);
      assert.strictEqual(s.misses, 1);
      assert.strictEqual(s.hitRate, 0.667);
      assert.strictEqual(s.entries, 1);
    });
  });
});
