// SSE client - connects to /api/stream with auto-reconnect

class SSEClient {
  constructor() {
    this.eventSource = null;
    this.listeners = {}; // { eventType: [callback1, callback2, ...] }
    this.reconnectDelay = 1000; // Start at 1s
    this.maxReconnectDelay = 30000; // Cap at 30s
    this.reconnectTimer = null;

    if (typeof window !== 'undefined' && typeof EventSource !== 'undefined') {
      this.connect();
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
      this.updateConnectionStatus(true);
      // Reset backoff on successful connection
      this.reconnectDelay = 1000;
    };

    this.eventSource.onerror = () => {
      this.updateConnectionStatus(false);
      this.eventSource.close();
      this.scheduleReconnect();
    };

    // Register listeners for known event types
    ['agent_status', 'bead_update', 'ralph_progress', 'activity', 'heartbeat'].forEach(type => {
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
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      if (typeof EventSource === 'undefined') {
        this.reconnectTimer = null;
        return;
      }
      this.connect();
      // Exponential backoff with cap
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }

  updateConnectionStatus(connected) {
    if (typeof document === 'undefined') return;

    const indicator = document.querySelector('#status-indicator');
    if (!indicator) return;

    if (connected) {
      indicator.classList.remove('disconnected');
      indicator.classList.add('connected');
    } else {
      indicator.classList.remove('connected');
      indicator.classList.add('disconnected');
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
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in SSE ${eventType} handler:`, error);
      }
    });
  }
}

// Export singleton instance
const sse = typeof window !== 'undefined' ? new SSEClient() : null;
export default sse;
