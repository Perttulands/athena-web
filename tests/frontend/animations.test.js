import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

describe('Animation Helpers', () => {
  let module;
  let dom;

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'http://localhost:9000'
    });

    global.window = dom.window;
    global.document = dom.window.document;

    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

    module = await import(`../../public/js/animations.js?t=${Date.now()}`);
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
  });

  it('applies stagger delay increments', () => {
    const root = document.querySelector('#root');
    root.innerHTML = '<div class="card-appear"></div><div class="card-appear"></div><div class="card-appear"></div>';

    const nodes = module.applyStagger(root, '.card-appear', 50);

    assert.strictEqual(nodes.length, 3);
    assert.strictEqual(nodes[0].style.animationDelay, '0ms');
    assert.strictEqual(nodes[1].style.animationDelay, '50ms');
    assert.strictEqual(nodes[2].style.animationDelay, '100ms');
  });

  it('disables stagger delay when reduced motion is requested', async () => {
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

    const reducedModule = await import(`../../public/js/animations.js?t=${Date.now() + 1}`);
    const root = document.querySelector('#root');
    root.innerHTML = '<div class="card-appear"></div><div class="card-appear"></div>';

    const nodes = reducedModule.applyStagger(root, '.card-appear', 70);

    assert.strictEqual(nodes[0].style.animationDelay, '0ms');
    assert.strictEqual(nodes[1].style.animationDelay, '0ms');
  });
});
