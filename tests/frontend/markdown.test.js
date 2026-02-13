import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

describe('Markdown Renderer', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    global.window = dom.window;
    global.document = dom.window.document;
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
  });

  it('escapes raw HTML to prevent script injection', async () => {
    const module = await import(`../../public/js/markdown.js?t=${Date.now()}`);
    const rendered = module.renderMarkdown('# Title\n<script>alert(1)</script>');

    assert.ok(rendered.innerHTML.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!rendered.innerHTML.includes('<script>'));
  });
});
