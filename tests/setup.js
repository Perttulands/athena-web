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

  let server;
  try {
    server = app.listen(0); // Random port
  } catch (error) {
    return skippedResult(error);
  }

  try {
    const port = server.address().port;

    const url = `http://localhost:${port}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const data = await response.json().catch(() => ({}));
    return { response, data, status: response.status, skipped: false };
  } catch (error) {
    return skippedResult(error);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
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

export { assert };
