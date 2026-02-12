import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import EventEmitter from 'node:events';

describe('SSE Service', () => {
  let SSEService;
  let service;

  beforeEach(async () => {
    // Dynamic import to get a fresh instance each test
    const module = await import(`../../services/sse-service.js?t=${Date.now()}`);
    SSEService = module.default;
    service = new SSEService();
  });

  afterEach(() => {
    if (service && service.cleanup) {
      service.cleanup();
    }
  });

  it('should be an event emitter', () => {
    assert.ok(service instanceof EventEmitter, 'Service should extend EventEmitter');
  });

  it('should add client and store response object', () => {
    const mockRes = createMockResponse();
    service.addClient(mockRes);

    assert.strictEqual(service.clients.size, 1, 'Should have 1 client');
    assert.ok(service.clients.has(mockRes), 'Should contain the response object');
  });

  it('should remove client on disconnect', () => {
    const mockRes = createMockResponse();
    service.addClient(mockRes);

    assert.strictEqual(service.clients.size, 1, 'Should have 1 client before disconnect');

    // Trigger close event
    mockRes.emit('close');

    assert.strictEqual(service.clients.size, 0, 'Should have 0 clients after disconnect');
  });

  it('should broadcast event to all clients', () => {
    const mockRes1 = createMockResponse();
    const mockRes2 = createMockResponse();

    service.addClient(mockRes1);
    service.addClient(mockRes2);

    service.broadcast('test_event', { message: 'hello' });

    // Check both clients received the message
    assert.strictEqual(mockRes1.writes.length, 1, 'Client 1 should receive message');
    assert.strictEqual(mockRes2.writes.length, 1, 'Client 2 should receive message');

    // Verify SSE format
    const expected = 'event: test_event\ndata: {"message":"hello"}\n\n';
    assert.strictEqual(mockRes1.writes[0], expected, 'Client 1 message format correct');
    assert.strictEqual(mockRes2.writes[0], expected, 'Client 2 message format correct');
  });

  it('should send heartbeat to all clients', () => {
    const mockRes = createMockResponse();
    service.addClient(mockRes);

    service.sendHeartbeat();

    assert.strictEqual(mockRes.writes.length, 1, 'Should send heartbeat');
    assert.strictEqual(mockRes.writes[0], ':heartbeat\n\n', 'Heartbeat format correct');
  });

  it('should not crash if client write fails', () => {
    const mockRes = createMockResponse();
    mockRes.write = () => { throw new Error('Write failed'); };

    service.addClient(mockRes);

    // Should not throw
    assert.doesNotThrow(() => {
      service.broadcast('test', { data: 'value' });
    }, 'Should handle write errors gracefully');
  });

  it('should remove client if write fails', () => {
    const mockRes = createMockResponse();
    mockRes.write = () => { throw new Error('Write failed'); };

    service.addClient(mockRes);
    assert.strictEqual(service.clients.size, 1, 'Should have 1 client');

    service.broadcast('test', { data: 'value' });

    assert.strictEqual(service.clients.size, 0, 'Should remove failed client');
  });
});

// Helper to create mock response object
function createMockResponse() {
  const res = new EventEmitter();
  res.writes = [];
  res.write = function(data) {
    this.writes.push(data);
  };
  res.on = EventEmitter.prototype.on.bind(res);
  res.once = EventEmitter.prototype.once.bind(res);
  res.emit = EventEmitter.prototype.emit.bind(res);
  return res;
}
