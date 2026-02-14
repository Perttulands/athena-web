// Test setup and helpers for Athena Web

import { strict as assert } from 'node:assert';
import { createServer, Socket } from 'node:net';

let listenCapability;

/**
 * Detect whether this environment allows binding local ports.
 */
export async function canListen() {
  if (listenCapability !== undefined) {
    return listenCapability;
  }

  listenCapability = await new Promise((resolve) => {
    const probe = createServer();
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    probe.once('error', () => {
      finish(false);
    });

    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close(() => finish(false));
        return;
      }

      const socket = new Socket();
      socket.setTimeout(200);

      socket.once('timeout', () => {
        socket.destroy();
        probe.close(() => finish(false));
      });

      socket.once('error', () => {
        probe.close(() => finish(false));
      });

      socket.connect(address.port, '127.0.0.1', () => {
        socket.end();
        probe.close(() => finish(true));
      });
    });
  });

  return listenCapability;
}

/**
 * Makes a request to the test server
 */
export async function request(app, path, options = {}) {
  const skippedResult = (error = null) => ({
    response: null,
    data: null,
    status: null,
    skipped: true,
    error
  });

  if (!(await canListen())) {
    return skippedResult();
  }

  const { timeoutMs = 5000, ...fetchOptions } = options;
  let server;
  try {
    server = app.listen(0); // Random port
  } catch (error) {
    return skippedResult(error);
  }

  const port = server.address().port;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const url = `http://localhost:${port}${path}`;
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers
      }
    });

    const data = await response.json().catch(() => ({}));
    return { response, data, status: response.status, skipped: false };
  } catch (error) {
    return skippedResult(error);
  } finally {
    clearTimeout(timeout);
    await closeServer(server);
  }
}

/**
 * Assert that response has expected status and data
 */
export function assertResponse(result, expectedStatus, expectedData) {
  assert.ok(result && typeof result === 'object',
    'Request did not return a response object');

  assert.equal(result.skipped ?? false, false,
    'Request skipped because sockets are unavailable in this environment');

  assert.equal(result.status, expectedStatus,
    `Expected status ${expectedStatus}, got ${result.status}`);

  if (expectedData !== undefined) {
    assert.deepEqual(result.data, expectedData,
      `Response data doesn't match expected`);
  }
}

export function closeServer(server) {
  if (!server || !server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function createHandleTracker() {
  const servers = new Set();
  const intervals = new Set();
  const eventSources = new Set();
  const watchers = new Set();
  const abortControllers = new Set();
  const services = new Set();

  return {
    trackServer(server) {
      if (server) {
        servers.add(server);
      }
      return server;
    },

    trackInterval(intervalId) {
      if (intervalId) {
        intervals.add(intervalId);
      }
      return intervalId;
    },

    trackEventSource(eventSource) {
      if (eventSource) {
        eventSources.add(eventSource);
      }
      return eventSource;
    },

    trackWatcher(watcher) {
      if (watcher) {
        watchers.add(watcher);
      }
      return watcher;
    },

    trackAbortController(controller) {
      if (controller) {
        abortControllers.add(controller);
      }
      return controller;
    },

    trackService(service) {
      if (service) {
        services.add(service);
      }
      return service;
    },

    async cleanup() {
      abortControllers.forEach((controller) => {
        try {
          controller.abort();
        } catch {
          // no-op
        }
      });
      abortControllers.clear();

      intervals.forEach((intervalId) => clearInterval(intervalId));
      intervals.clear();

      eventSources.forEach((source) => {
        try {
          source.close?.();
        } catch {
          // no-op
        }
      });
      eventSources.clear();

      watchers.forEach((watcher) => {
        try {
          watcher.close?.();
        } catch {
          // no-op
        }
      });
      watchers.clear();

      services.forEach((service) => {
        try {
          service.stopMonitoring?.();
        } catch {
          // no-op
        }

        try {
          service.stop?.();
        } catch {
          // no-op
        }

        try {
          service.cleanup?.();
        } catch {
          // no-op
        }
      });
      services.clear();

      await Promise.all([...servers].map((server) => closeServer(server).catch(() => {})));
      servers.clear();
    }
  };
}

export { assert };
