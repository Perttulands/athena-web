import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';

describe('PWA Setup', () => {
  it('serves a valid manifest with required fields', async () => {
    const raw = await readFile('public/manifest.json', 'utf8');
    const manifest = JSON.parse(raw);

    assert.strictEqual(manifest.name, 'Athena');
    assert.strictEqual(manifest.display, 'standalone');
    assert.ok(Array.isArray(manifest.icons));
    assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
    assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  });

  it('references manifest and service worker in app shell', async () => {
    const index = await readFile('public/index.html', 'utf8');
    const app = await readFile('public/js/app.js', 'utf8');

    assert.ok(index.includes('rel="manifest"'));
    assert.ok(index.includes('apple-mobile-web-app-capable'));
    assert.ok(app.includes("serviceWorker.register('/sw.js')"));
  });

  it('includes offline fallback message', async () => {
    const offline = await readFile('public/offline.html', 'utf8');
    assert.ok(offline.includes('Athena is offline'));
    assert.ok(offline.includes('owl watches patiently'));
  });
});
