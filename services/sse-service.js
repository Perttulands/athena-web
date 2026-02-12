import EventEmitter from 'node:events';

/**
 * SSE Service - Singleton event emitter for server-sent events
 * Manages client connections and broadcasts real-time updates
 */
class SSEService extends EventEmitter {
  constructor() {
    super();
    this.clients = new Set();
    this.heartbeatInterval = null;
  }

  /**
   * Add a client connection
   * @param {Response} res - Express response object
   */
  addClient(res) {
    this.clients.add(res);

    // Remove client when connection closes
    res.once('close', () => {
      this.removeClient(res);
    });

    console.log(`SSE client connected. Total clients: ${this.clients.size}`);
  }

  /**
   * Remove a client connection
   * @param {Response} res - Express response object
   */
  removeClient(res) {
    this.clients.delete(res);
    console.log(`SSE client disconnected. Total clients: ${this.clients.size}`);
  }

  /**
   * Broadcast an event to all connected clients
   * @param {string} type - Event type
   * @param {Object} data - Event data
   */
  broadcast(type, data) {
    const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

    // Send to all clients, removing any that fail
    for (const client of this.clients) {
      try {
        client.write(message);
      } catch (error) {
        console.error('Failed to write to SSE client:', error.message);
        this.removeClient(client);
      }
    }
  }

  /**
   * Send heartbeat to all clients
   * SSE comment format - keeps connection alive
   */
  sendHeartbeat() {
    const heartbeat = ':heartbeat\n\n';

    for (const client of this.clients) {
      try {
        client.write(heartbeat);
      } catch (error) {
        console.error('Failed to send heartbeat:', error.message);
        this.removeClient(client);
      }
    }
  }

  /**
   * Start heartbeat interval (30s)
   */
  startHeartbeat() {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000); // 30 seconds

    console.log('SSE heartbeat started (30s interval)');
  }

  /**
   * Stop heartbeat interval
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('SSE heartbeat stopped');
    }
  }

  /**
   * Cleanup - for testing
   */
  cleanup() {
    this.stopHeartbeat();
    this.clients.clear();
  }
}

// Export singleton instance
export default SSEService;
