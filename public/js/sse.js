// SSE client - connects to /api/stream with auto-reconnect, jitter, and visibility awareness

class SSEClient {
  constructor() {
    this.eventSource = null;
    this.listeners = {};
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.reconnectTimer = null;
    this.connected = false;
    this.retryCount = 0;

    if (typeof window !== 'undefined' && typeof EventSource !== 'undefined') {
      this.connect();
      this._bindVisibility();
    } else if (typeof window !== 'undefined') {
      this.updateConnectionStatus(false);
    }
  }

  connect() {
    if (typeof EventSource === 'undefined') {
      this.updateConnectionStatus(false);
      return;
    }

    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource('/api/stream');

    this.eventSource.onopen = () => {
      this.connected = true;
      this.retryCount = 0;
      this.reconnectDelay = 1000;
      this.updateConnectionStatus(true);
    };

    this.eventSource.onerror = () => {
      this.connected = false;
      this.updateConnectionStatus(false);
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
      this.scheduleReconnect();
    };

    // Register listeners for known event types
    const eventTypes = [
      'agent_status', 'bead_update', 'ralph_progress',
      'activity', 'heartbeat', 'artifact_update', 'inbox_update',
      'agent_output', 'agent_error'
    ];
    for (const type of eventTypes) {
      this.eventSource.addEventListener(type, (event) => {
        let data = {};
        if (event.data) {
          try {
            data = JSON.parse(event.data);
          } catch {
            data = { raw: event.data };
          }
        }
        this.dispatch(type, data);
      });
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.retryCount++;

    // Exponential backoff with jitter: delay * (0.5..1.5)
    const jitter = 0.5 + Math.random();
    const delay = Math.min(this.reconnectDelay * jitter, this.maxReconnectDelay);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (typeof EventSource === 'undefined') return;
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, delay);
  }

  /**
   * Reconnect immediately when tab becomes visible after being hidden.
   */
  _bindVisibility() {
    if (typeof document === 'undefined') return;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.connected) {
        // Cancel pending reconnect and try immediately
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.reconnectDelay = 1000;
        this.connect();
      }
    });
  }

  updateConnectionStatus(connected) {
    if (typeof document === 'undefined') return;

    const indicator = document.querySelector('#status-indicator');
    if (indicator) {
      if (connected) {
        indicator.classList.remove('disconnected');
        indicator.classList.add('connected');
      } else {
        indicator.classList.remove('connected');
        indicator.classList.add('disconnected');
      }
    }

    // Show/hide reconnection banner
    let banner = document.querySelector('#sse-reconnect-banner');
    if (!connected && this.retryCount > 0) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'sse-reconnect-banner';
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;' +
          'background:var(--color-warning, #f59e0b);color:#000;text-align:center;' +
          'padding:6px 12px;font-size:0.85rem;';
        document.body.prepend(banner);
      }
      banner.textContent = `Reconnecting to server... (attempt ${this.retryCount})`;
    } else if (banner) {
      banner.remove();
    }
  }

  on(eventType, callback) {
    if (!this.listeners[eventType]) {
      this.listeners[eventType] = [];
    }
    this.listeners[eventType].push(callback);
  }

  off(eventType, callback) {
    const callbacks = this.listeners[eventType];
    if (!callbacks || callbacks.length === 0) return;
    this.listeners[eventType] = callbacks.filter(handler => handler !== callback);
  }

  dispatch(eventType, data) {
    const callbacks = this.listeners[eventType] || [];
    for (const callback of callbacks) {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in SSE ${eventType} handler:`, error);
      }
    }
  }

  destroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
    this.listeners = {};
  }
}

// Export singleton instance
const sse = typeof window !== 'undefined' ? new SSEClient() : null;
export default sse;
