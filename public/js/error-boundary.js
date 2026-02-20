/**
 * Error boundary for Athena Web frontend.
 * Catches unhandled errors and promise rejections, displays a recovery UI,
 * and reports errors to the activity API.
 */

class ErrorBoundary {
  constructor() {
    this.errors = [];
    this.maxErrors = 10;
    this.recoveryShown = false;
    this._bind();
  }

  _bind() {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
      this._handleError({
        type: 'uncaught',
        message: event.message || 'Unknown error',
        source: event.filename || '',
        line: event.lineno || 0,
        col: event.colno || 0,
        stack: event.error?.stack || ''
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      this._handleError({
        type: 'unhandled_rejection',
        message: reason?.message || String(reason || 'Unknown rejection'),
        stack: reason?.stack || ''
      });
    });
  }

  _handleError(errorInfo) {
    this.errors.push({
      ...errorInfo,
      ts: new Date().toISOString()
    });

    // Keep bounded
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Report to server (best-effort)
    this._report(errorInfo);

    // Show recovery UI if we're getting repeated errors
    if (this.errors.length >= 3 && !this.recoveryShown) {
      this._showRecoveryBanner();
    }

    console.error('[ErrorBoundary]', errorInfo.type, errorInfo.message);
  }

  _report(errorInfo) {
    try {
      const body = JSON.stringify({
        type: 'client_error',
        error: errorInfo.message,
        source: errorInfo.source || '',
        stack: (errorInfo.stack || '').slice(0, 500)
      });

      // Use sendBeacon if available for reliability, otherwise fetch
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/activity/report', body);
      } else {
        fetch('/api/activity/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
          signal: AbortSignal.timeout(5000)
        }).catch(() => { /* best-effort reporting */ });
      }
    } catch {
      // Reporting is best-effort
    }
  }

  _showRecoveryBanner() {
    if (typeof document === 'undefined') return;
    if (this.recoveryShown) return;
    this.recoveryShown = true;

    const existing = document.querySelector('#error-recovery-banner');
    if (existing) return;

    const banner = document.createElement('div');
    banner.id = 'error-recovery-banner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText =
      'position:fixed;bottom:70px;left:12px;right:12px;z-index:10000;' +
      'background:var(--color-error, #ef4444);color:#fff;' +
      'border-radius:8px;padding:12px 16px;font-size:0.9rem;' +
      'display:flex;align-items:center;justify-content:space-between;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.3);';

    banner.innerHTML = `
      <span>Something went wrong. The page may not work correctly.</span>
      <div style="display:flex;gap:8px;flex-shrink:0;">
        <button type="button" id="error-reload-btn"
          style="background:#fff;color:#ef4444;border:none;border-radius:4px;
                 padding:6px 12px;cursor:pointer;font-weight:600;">
          Reload
        </button>
        <button type="button" id="error-dismiss-btn"
          style="background:transparent;color:#fff;border:1px solid #fff;
                 border-radius:4px;padding:6px 12px;cursor:pointer;">
          Dismiss
        </button>
      </div>
    `;

    document.body.appendChild(banner);

    banner.querySelector('#error-reload-btn')?.addEventListener('click', () => {
      window.location.reload();
    });

    banner.querySelector('#error-dismiss-btn')?.addEventListener('click', () => {
      banner.remove();
      // Allow showing again if more errors come
      setTimeout(() => { this.recoveryShown = false; }, 30000);
    });
  }

  /**
   * Wrap an async function with error catching and fallback UI.
   */
  wrap(fn, fallbackHtml) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this._handleError({
          type: 'caught',
          message: error.message,
          stack: error.stack || ''
        });

        if (fallbackHtml && typeof document !== 'undefined') {
          const app = document.querySelector('#app');
          if (app) {
            app.innerHTML = fallbackHtml;
            app.style.opacity = '1';
          }
        }

        return null;
      }
    };
  }

  getErrors() {
    return [...this.errors];
  }

  clear() {
    this.errors = [];
    this.recoveryShown = false;
    const banner = document.querySelector('#error-recovery-banner');
    if (banner) banner.remove();
  }
}

const errorBoundary = typeof window !== 'undefined' ? new ErrorBoundary() : null;
export default errorBoundary;
