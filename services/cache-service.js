/**
 * Cache service layer for Athena Web.
 * Simple TTL-based in-memory cache to avoid redundant calls
 * to beads CLI, tmux, filesystem reads, etc.
 */

class CacheEntry {
  constructor(value, ttlMs) {
    this.value = value;
    this.expiresAt = Date.now() + ttlMs;
  }

  isExpired() {
    return Date.now() >= this.expiresAt;
  }
}

class CacheService {
  constructor(options = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 5000;
    this.maxEntries = options.maxEntries ?? 100;
    /** @type {Map<string, CacheEntry>} */
    this.store = new Map();
    /** @type {Map<string, Promise>} */
    this.inflight = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get a cached value by key.
   * @param {string} key
   * @returns {*} cached value or undefined if missing/expired
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry || entry.isExpired()) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  /**
   * Store a value with optional TTL override.
   * @param {string} key
   * @param {*} value
   * @param {number} [ttlMs]
   */
  set(key, value, ttlMs) {
    // Evict oldest entries if at capacity
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const firstKey = this.store.keys().next().value;
      this.store.delete(firstKey);
    }
    this.store.set(key, new CacheEntry(value, ttlMs ?? this.defaultTtlMs));
  }

  /**
   * Delete a specific key.
   * @param {string} key
   */
  delete(key) {
    this.store.delete(key);
    this.inflight.delete(key);
  }

  /**
   * Clear all cached entries.
   */
  clear() {
    this.store.clear();
    this.inflight.clear();
  }

  /**
   * Get-or-fetch: returns cached value if fresh, otherwise calls fetchFn
   * and caches the result. Deduplicates concurrent calls for the same key.
   * @param {string} key
   * @param {() => Promise<*>} fetchFn
   * @param {number} [ttlMs]
   * @returns {Promise<*>}
   */
  async getOrFetch(key, fetchFn, ttlMs) {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    // Deduplicate concurrent inflight requests
    if (this.inflight.has(key)) {
      return this.inflight.get(key);
    }

    const promise = fetchFn().then(
      (value) => {
        this.set(key, value, ttlMs);
        this.inflight.delete(key);
        return value;
      },
      (err) => {
        this.inflight.delete(key);
        throw err;
      }
    );

    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * Cache statistics for monitoring.
   */
  stats() {
    const total = this.hits + this.misses;
    return {
      entries: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? parseFloat((this.hits / total).toFixed(3)) : 0
    };
  }
}

// Singleton instance with sensible defaults
const cache = new CacheService({ defaultTtlMs: 5000, maxEntries: 100 });

export default cache;
export { CacheService };
