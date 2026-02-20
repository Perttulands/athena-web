import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Mobile Responsive CSS (AW-020)', () => {
  let baseCSS, pagesCSS;

  it('should load CSS files', async () => {
    baseCSS = await readFile(join(root, 'public/css/base.css'), 'utf-8');
    pagesCSS = await readFile(join(root, 'public/css/pages.css'), 'utf-8');
    assert.ok(baseCSS.length > 0);
    assert.ok(pagesCSS.length > 0);
  });

  it('base.css should have max-width 480px breakpoint', async () => {
    assert.ok(baseCSS.includes('max-width: 480px'));
  });

  it('base.css should have coarse pointer media query for touch targets', async () => {
    assert.ok(baseCSS.includes('pointer: coarse'));
    assert.ok(baseCSS.includes('touch-target-min'));
  });

  it('base.css should have safe-area-inset support', async () => {
    assert.ok(baseCSS.includes('safe-area-inset-bottom'));
  });

  it('base.css should have fluid typography with clamp', async () => {
    assert.ok(baseCSS.includes('clamp('));
  });

  it('pages.css should have mobile stat grid layout', async () => {
    assert.ok(pagesCSS.includes('max-width: 480px'));
  });

  it('pages.css should have responsive chronicle filters', async () => {
    assert.ok(pagesCSS.includes('.chronicle-filters'));
    assert.ok(pagesCSS.includes('flex-direction: column'));
  });

  it('pages.css should have agent grid breakpoint at 768px', async () => {
    assert.ok(pagesCSS.includes('.page-agents .agents-grid'));
  });

  it('index.html should have viewport meta with viewport-fit=cover', async () => {
    const html = await readFile(join(root, 'public/index.html'), 'utf-8');
    assert.ok(html.includes('viewport-fit=cover'));
  });
});
