/**
 * App Router
 * Hash-based SPA router for Athena Web.
 */

import { applyPageEnterAnimation } from './animations.js';

const routes = {
  '/oracle': () => import('./pages/oracle.js'),
  '/beads': () => import('./pages/beads.js'),
  '/agents': () => import('./pages/agents.js'),
  '/portal': () => import('./pages/portal.js'),
  '/chronicle': () => import('./pages/chronicle.js')
};

const routeAliases = {
  '/scrolls': '/portal',
  '/artifacts': '/portal',
  '/inbox': '/portal'
};

let currentUnmount = null;
let installPromptEvent = null;

function normalizeHash(hash) {
  if (!hash) return '/oracle';
  return hash.startsWith('/') ? hash : `/${hash}`;
}

function setMainFocus(scope) {
  if (!scope) return;

  const heading = scope.querySelector('.page-title');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus();
    return;
  }

  const firstFocusable = scope.querySelector('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (firstFocusable && typeof firstFocusable.focus === 'function') {
    firstFocusable.focus();
    return;
  }

  const app = document.querySelector('#app');
  app?.focus?.();
}

function renderInstallPrompt() {
  if (typeof document === 'undefined') return;
  if (!installPromptEvent) return;

  if (document.querySelector('#install-banner')) return;

  const banner = document.createElement('aside');
  banner.id = 'install-banner';
  banner.className = 'install-banner card card-compact';
  banner.setAttribute('role', 'status');
  banner.innerHTML = `
    <p>Add Athena to your home screen for a full-screen temple experience.</p>
    <div class="install-banner-actions">
      <button type="button" class="btn btn-sm btn-primary" id="install-now">Install</button>
      <button type="button" class="btn btn-sm btn-ghost" id="install-later">Later</button>
    </div>
  `;

  const main = document.querySelector('#app');
  main?.prepend(banner);

  banner.querySelector('#install-now')?.addEventListener('click', async () => {
    try {
      await installPromptEvent.prompt();
      await installPromptEvent.userChoice;
    } catch {
      // no-op: user dismissed or prompt unavailable
    }

    installPromptEvent = null;
    banner.remove();
  });

  banner.querySelector('#install-later')?.addEventListener('click', () => {
    banner.remove();
  });
}

function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration is optional in development.
    });
  });
}

/**
 * Navigate to current route.
 */
export async function navigate() {
  if (typeof window === 'undefined') return;

  const hash = normalizeHash(window.location.hash.slice(1) || '/oracle');
  const canonicalHash = routeAliases[hash] || hash;
  const loader = routes[canonicalHash] || routes['/oracle'];
  const resolvedHash = routes[canonicalHash] ? canonicalHash : '/oracle';

  const appEl = document.querySelector('#app');
  if (!appEl) return;

  appEl.setAttribute('aria-busy', 'true');

  if (typeof currentUnmount === 'function') {
    currentUnmount();
    currentUnmount = null;
  }

  appEl.style.opacity = '0';
  await new Promise((resolve) => setTimeout(resolve, 120));

  try {
    const pageModule = await loader();
    const html = typeof pageModule.render === 'function' ? pageModule.render() : '';

    if (typeof html === 'string') {
      appEl.innerHTML = html;
    } else {
      appEl.innerHTML = '';
    }

    if (typeof pageModule.mount === 'function') {
      const unmount = await pageModule.mount(appEl);
      if (typeof unmount === 'function') {
        currentUnmount = unmount;
      }
    }

    appEl.style.opacity = '1';
    appEl.setAttribute('aria-busy', 'false');

    const pageScope = appEl.firstElementChild;
    applyPageEnterAnimation(pageScope);
    setMainFocus(pageScope || appEl);

    updateActiveNav(resolvedHash);
    renderInstallPrompt();
  } catch (error) {
    console.error('Failed to load route:', error);
    appEl.innerHTML = '<div class="empty-state">Failed to load page. Please refresh.</div>';
    appEl.style.opacity = '1';
    appEl.setAttribute('aria-busy', 'false');
  }
}

/**
 * Update active nav state.
 */
export function updateActiveNav(hash) {
  if (typeof document === 'undefined') return;

  const pageName = (routeAliases[hash] || hash).slice(1);
  const navItems = document.querySelectorAll('#bottom-nav [data-page]');

  navItems.forEach((item) => {
    const isActive = item.getAttribute('data-page') === pageName;
    item.classList.toggle('active', isActive);

    if (isActive) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });
}

/**
 * Initialize app.
 */
export function init() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const appEl = document.querySelector('#app');
  if (appEl) {
    appEl.style.transition = 'opacity 200ms ease';
    appEl.setAttribute('tabindex', '-1');
  }

  window.addEventListener('hashchange', navigate);

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPromptEvent = event;
    renderInstallPrompt();
  });

  const navItems = document.querySelectorAll('#bottom-nav [data-page]');
  navItems.forEach((item) => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      const page = item.getAttribute('data-page');
      const nextHash = `#/${page}`;

      if (window.location.hash === nextHash) {
        navigate();
        return;
      }

      window.location.hash = nextHash;
    });
  });

  registerServiceWorker();
  if (!window.location.hash) {
    window.location.hash = '#/oracle';
  }
  navigate();
}

const shouldAutoInit = typeof document !== 'undefined' &&
  !(typeof window !== 'undefined' && window.__ATHENA_DISABLE_AUTO_INIT__ === true);

if (shouldAutoInit) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
