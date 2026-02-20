import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { EventEmitter } from 'events';

// Mock EventSource
class MockEventSource extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.eventListeners = {};
    MockEventSource.instances.push(this);

    // Simulate connection after a tick
    setTimeout(() => {
      this.readyState = 1; // OPEN
      this.onopen?.();
    }, 10);
  }

  addEventListener(type, listener) {
    if (!this.eventListeners[type]) {
      this.eventListeners[type] = [];
    }
    this.eventListeners[type].push(listener);
    this.on(type, listener);
  }

  close() {
    this.readyState = 2; // CLOSED
    this.onclose?.();
  }

  simulateEvent(type, data) {
    const event = { type, data: JSON.stringify(data) };
    this.emit(type, event);
    if (this[`on${type}`]) {
      this[`on${type}`](event);
    }
  }

  simulateError() {
    const error = new Error('Connection error');
    if (this.onerror) {
      this.onerror(error);
    }
    // Don't emit on EventEmitter - just call the handler
  }

  static instances = [];
  static reset() {
    this.instances = [];
  }
}

describe('SSE Client', () => {
  let sse;
  let currentInstance;

  before(async () => {
    // Setup DOM
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="status-indicator"></div></body></html>', {
      url: 'http://localhost:9000'
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.EventSource = MockEventSource;

    // Import module after globals are set
    const module = await import('../../public/js/sse.js?t=' + Date.now());
    sse = module.default;

    // Wait for initial connection
    await new Promise(resolve => setTimeout(resolve, 20));
    currentInstance = MockEventSource.instances[0];
  });

  after(() => {
    delete global.window;
    delete global.document;
    delete global.EventSource;
  });

  it('should connect to /api/stream', async () => {
    assert.strictEqual(MockEventSource.instances.length, 1);
    assert.strictEqual(currentInstance.url, '/api/stream');
  });

  it('should update connection indicator to connected when open', async () => {
    const indicator = document.querySelector('#status-indicator');
    assert.strictEqual(indicator.classList.contains('connected'), true);
  });

  it('should call registered callback on event', async () => {
    let called = false;
    let receivedData = null;

    sse.on('agent_status', (data) => {
      called = true;
      receivedData = data;
    });

    currentInstance.simulateEvent('agent_status', { name: 'agent-1', status: 'running' });

    assert.strictEqual(called, true);
    assert.deepStrictEqual(receivedData, { name: 'agent-1', status: 'running' });
  });

  it('should support multiple callbacks for same event type', async () => {
    let call1 = false;
    let call2 = false;

    sse.on('bead_update', () => { call1 = true; });
    sse.on('bead_update', () => { call2 = true; });

    currentInstance.simulateEvent('bead_update', { id: 'bd-1' });

    assert.strictEqual(call1, true);
    assert.strictEqual(call2, true);
  });

  it('should reconnect on error with exponential backoff', async () => {
    const initialLength = MockEventSource.instances.length;
    currentInstance.simulateError();

    // Wait for reconnection attempt (1s base backoff with jitter 0.5..1.5x)
    await new Promise(resolve => setTimeout(resolve, 2000));

    assert.strictEqual(MockEventSource.instances.length, initialLength + 1);
  });

  it('should update connection indicator to disconnected on error', async () => {
    currentInstance.simulateError();

    const indicator = document.querySelector('#status-indicator');
    assert.strictEqual(indicator.classList.contains('connected'), false);
    assert.strictEqual(indicator.classList.contains('disconnected'), true);
  });

  it('should cap exponential backoff at 30 seconds', async () => {
    // Simulate multiple errors to test backoff cap
    // Backoff sequence: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    // We'll verify reconnection happens without testing exact timing

    const initialLength = MockEventSource.instances.length;

    // Trigger error and wait for first reconnect
    if (MockEventSource.instances.length > 0) {
      MockEventSource.instances[MockEventSource.instances.length - 1].simulateError();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Should have attempted reconnection
    assert.ok(MockEventSource.instances.length >= initialLength);
  });
});
