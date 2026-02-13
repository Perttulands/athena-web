import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

describe('Router Tests', () => {
  let dom;
  let window;
  let document;
  let navigate;
  let updateActiveNav;

  before(async () => {
    // Create a DOM environment
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <main id="app"></main>
          <nav id="bottom-nav">
            <a href="#/oracle" data-page="oracle">Oracle</a>
            <a href="#/beads" data-page="beads">Beads</a>
            <a href="#/agents" data-page="agents">Agents</a>
            <a href="#/scrolls" data-page="scrolls">Scrolls</a>
            <a href="#/chronicle" data-page="chronicle">Chronicle</a>
          </nav>
        </body>
      </html>
    `, {
      url: 'http://localhost:9000',
      runScripts: 'outside-only'
    });

    window = dom.window;
    document = window.document;
    global.window = window;
    global.document = document;

    // Import app.js with the global window/document set
    const appModule = await import(`../../public/js/app.js?t=${Date.now()}`);
    navigate = appModule.navigate;
    updateActiveNav = appModule.updateActiveNav;
  });

  after(() => {
    delete global.window;
    delete global.document;
  });

  it('should route to oracle page by default', async () => {
    window.location.hash = '#/oracle';
    await navigate();

    // Wait for async loading and rendering
    await new Promise(resolve => setTimeout(resolve, 300));

    const appContent = document.querySelector('#app').innerHTML;
    assert.ok(appContent.includes('Oracle'), 'Oracle page should be rendered');
  });

  it('should route to beads page when hash changes', async () => {
    window.location.hash = '#/beads';
    await navigate();

    await new Promise(resolve => setTimeout(resolve, 300));

    const appContent = document.querySelector('#app').innerHTML;
    assert.ok(appContent.includes('Beads'), 'Beads page should be rendered');
  });

  it('should route to agents page when hash changes', async () => {
    window.location.hash = '#/agents';
    await navigate();

    await new Promise(resolve => setTimeout(resolve, 300));

    const appContent = document.querySelector('#app').innerHTML;
    assert.ok(appContent.includes('Agents'), 'Agents page should be rendered');
  });

  it('should route to scrolls page when hash changes', async () => {
    window.location.hash = '#/scrolls';
    await navigate();

    await new Promise(resolve => setTimeout(resolve, 300));

    const appContent = document.querySelector('#app').innerHTML;
    assert.ok(appContent.includes('Scrolls'), 'Scrolls page should be rendered');
  });

  it('should route to chronicle page when hash changes', async () => {
    window.location.hash = '#/chronicle';
    await navigate();

    await new Promise(resolve => setTimeout(resolve, 300));

    const appContent = document.querySelector('#app').innerHTML;
    assert.ok(appContent.includes('Chronicle'), 'Chronicle page should be rendered');
  });

  it('should highlight active nav item', async () => {
    window.location.hash = '#/beads';
    await navigate();

    await new Promise(resolve => setTimeout(resolve, 300));

    const beadsNav = document.querySelector('[data-page="beads"]');
    const oracleNav = document.querySelector('[data-page="oracle"]');

    assert.ok(beadsNav.classList.contains('active'), 'Beads nav should be active');
    assert.ok(!oracleNav.classList.contains('active'), 'Oracle nav should not be active');
  });

  it('should default to oracle when hash is empty', async () => {
    window.location.hash = '';
    await navigate();

    await new Promise(resolve => setTimeout(resolve, 300));

    const appContent = document.querySelector('#app').innerHTML;
    assert.ok(appContent.includes('Oracle'), 'Oracle page should be rendered by default');
  });
});
