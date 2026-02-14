import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert';
import EventEmitter from 'node:events';
import { createHandleTracker } from '../setup.js';

describe('SSE Service', () => {
  let SSEService;
  let service;
  const handles = createHandleTracker();

  beforeEach(async () => {
    // Dynamic import to get a fresh instance each test
    const module = await import(`../../services/sse-service.js?t=${Date.now()}`);
    SSEService = module.default;
    service = handles.trackService(new SSEService());
  });

  afterEach(() => {
    if (service && service.cleanup) {
      service.cleanup();
    }
  });

  after(async () => {
    await handles.cleanup();
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

  it('should broadcast updates when filesystem watcher fires', async () => {
    const watcherCallbacks = new Map();
    const closedWatchers = [];

    const customService = handles.trackService(new SSEService({
      statePath: '/tmp/athena-state',
      watchFn: (directoryPath, callback) => {
        watcherCallbacks.set(directoryPath, callback);
        return {
          close() {
            closedWatchers.push(directoryPath);
          }
        };
      },
      listAgentsFn: async () => [],
      listBeadsFn: async () => ([
        { status: 'active' },
        { status: 'done' }
      ]),
      listRunsFn: async () => ([
        { bead: 'bd-1', started_at: '2026-02-13T10:00:00Z', exit_code: 0 }
      ]),
      getRalphStatusFn: async () => ({
        activeTask: 'US-020',
        currentIteration: 3,
        maxIterations: 6,
        prdProgress: { done: 4, total: 10 },
        tasks: []
      }),
      agentPollIntervalMs: 1000000
    }));

    const events = [];
    const originalBroadcast = customService.broadcast.bind(customService);
    customService.broadcast = (type, data) => {
      events.push({ type, data });
      originalBroadcast(type, data);
    };

    try {
      customService.startMonitoring();
      const runsWatcher = watcherCallbacks.get('/tmp/athena-state/runs');
      assert.ok(runsWatcher, 'Runs directory should be watched');

      runsWatcher('change', 'bd-1.json');
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(events.some(event => event.type === 'bead_update'));
      assert.ok(events.some(event => event.type === 'activity'));
      assert.ok(events.some(event => event.type === 'ralph_progress'));

      customService.stopMonitoring();
      assert.ok(closedWatchers.includes('/tmp/athena-state/runs'));
      assert.ok(closedWatchers.includes('/tmp/athena-state/results'));
    } finally {
      customService.cleanup();
    }
  });

  it('should broadcast agent_status only when agent snapshot changes', async () => {
    const snapshots = [
      [{ name: 'agent-bd-1', status: 'running', bead: 'bd-1', runningTime: '2m', contextPercent: 10 }],
      [{ name: 'agent-bd-1', status: 'running', bead: 'bd-1', runningTime: '2m', contextPercent: 10 }],
      [{ name: 'agent-bd-1', status: 'running', bead: 'bd-1', runningTime: '3m', contextPercent: 12 }]
    ];
    let callCount = 0;

    const customService = handles.trackService(new SSEService({
      listAgentsFn: async () => snapshots[Math.min(callCount++, snapshots.length - 1)],
      watchFn: () => ({ close() {} }),
      listBeadsFn: async () => [],
      listRunsFn: async () => [],
      getRalphStatusFn: async () => ({
        activeTask: null,
        currentIteration: 0,
        maxIterations: 0,
        prdProgress: { done: 0, total: 0 },
        tasks: []
      })
    }));

    const agentEvents = [];
    customService.broadcast = (type, data) => {
      if (type === 'agent_status') {
        agentEvents.push(data);
      }
    };

    try {
      await customService.pollAgentStatus();
      await customService.pollAgentStatus();
      await customService.pollAgentStatus();

      assert.strictEqual(agentEvents.length, 2, 'Should broadcast first and changed snapshots only');
      assert.strictEqual(agentEvents[0].running, 1);
      assert.strictEqual(agentEvents[1].agents[0].runningTime, '3m');
    } finally {
      customService.cleanup();
    }
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
