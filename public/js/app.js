/**
 * App Router
 * Hash-based SPA router for Athena Web
 */

const routes = {
  '/oracle': () => import('./pages/oracle.js'),
  '/beads': () => import('./pages/beads.js'),
  '/agents': () => import('./pages/agents.js'),
  '/scrolls': () => import('./pages/scrolls.js'),
  '/chronicle': () => import('./pages/chronicle.js'),
};

let currentUnmount = null;

/**
 * Navigate to a route
 */
async function navigate() {
  if (typeof window === 'undefined') return; // Guard for non-browser environments

  // Get hash, default to /oracle
  const hash = window.location.hash.slice(1) || '/oracle';

  // Get the route loader
  const loader = routes[hash];

  if (!loader) {
    console.warn(`Unknown route: ${hash}`);
    return;
  }

  // Fade out current page
  const appEl = document.querySelector('#app');
  if (appEl) {
    if (typeof currentUnmount === 'function') {
      currentUnmount();
      currentUnmount = null;
    }
    appEl.style.opacity = '0';
  }

  // Wait for fade-out transition
  await new Promise(resolve => setTimeout(resolve, 200));

  // Load page module and render
  try {
    const pageModule = await loader();
    const html = pageModule.render();

    if (appEl) {
      appEl.innerHTML = html;

      if (typeof pageModule.mount === 'function') {
        const unmount = await pageModule.mount(appEl);
        if (typeof unmount === 'function') {
          currentUnmount = unmount;
        }
      }

      // Fade in new page
      appEl.style.opacity = '1';
    }

    updateActiveNav(hash);
  } catch (error) {
    console.error('Failed to load page:', error);
    if (appEl) {
      appEl.innerHTML = '<div class="error">Failed to load page</div>';
      appEl.style.opacity = '1';
    }
  }
}

/**
 * Update active state on navigation
 */
function updateActiveNav(hash) {
  if (typeof document === 'undefined') return; // Guard for non-browser environments

  const pageName = hash.slice(1); // Remove leading slash
  const navItems = document.querySelectorAll('#bottom-nav [data-page]');

  navItems.forEach(item => {
    const itemPage = item.getAttribute('data-page');
    if (itemPage === pageName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

/**
 * Initialize router
 */
function init() {
  if (typeof document === 'undefined') return; // Guard for non-browser environments

  // Set up transition style
  const appEl = document.querySelector('#app');
  if (appEl) {
    appEl.style.transition = 'opacity 200ms ease';
  }

  // Listen for hash changes
  window.addEventListener('hashchange', navigate);

  // Initial navigation
  navigate();

  // Wire bottom nav click handlers
  const navItems = document.querySelectorAll('#bottom-nav [data-page]');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.getAttribute('data-page');
      window.location.hash = `#/${page}`;
    });
  });
}

// Auto-initialize when DOM is ready (only in browser)
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

// Export for testing
export { navigate, updateActiveNav, init };
