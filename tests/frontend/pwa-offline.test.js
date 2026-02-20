import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('PWA Offline Caching (AW-022)', () => {
  let sw;

  it('should load service worker', async () => {
    sw = await readFile(join(root, 'public/sw.js'), 'utf-8');
    assert.ok(sw.length > 0);
  });

  it('should define separate static and API caches', () => {
    assert.ok(sw.includes("STATIC_CACHE = 'athena-static-v4'"));
    assert.ok(sw.includes("API_CACHE = 'athena-api-v1'"));
  });

  it('should list cacheable API paths', () => {
    assert.ok(sw.includes('/api/status'));
    assert.ok(sw.includes('/api/beads'));
    assert.ok(sw.includes('/api/tapestry'));
    assert.ok(sw.includes('/api/timeline'));
    assert.ok(sw.includes('/api/health-dashboard'));
    assert.ok(sw.includes('/api/runs'));
  });

  it('should include new page assets in static cache', () => {
    assert.ok(sw.includes('/js/pages/health.js'));
    assert.ok(sw.includes('/js/pages/tapestry.js'));
  });

  it('should have trimApiCache function for cache eviction', () => {
    assert.ok(sw.includes('trimApiCache'));
    assert.ok(sw.includes('API_CACHE_MAX_ENTRIES'));
  });

  it('should clean up old caches on activate', () => {
    assert.ok(sw.includes('KEEP'));
    assert.ok(sw.includes('API_CACHE'));
  });

  it('should have network-first strategy for cacheable APIs', () => {
    assert.ok(sw.includes('isApiCacheable'));
    assert.ok(sw.includes('cache.put(request, cloned)'));
  });

  it('should have offline fallback page for navigation', () => {
    assert.ok(sw.includes('OFFLINE_URL'));
    assert.ok(sw.includes("caches.match(OFFLINE_URL)"));
  });

  it('manifest.json should exist and have correct start_url', async () => {
    const manifest = JSON.parse(await readFile(join(root, 'public/manifest.json'), 'utf-8'));
    assert.ok(manifest.name);
    assert.ok(manifest.start_url);
    assert.strictEqual(manifest.display, 'standalone');
  });
});
