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
  if (!(await canListen())) {
    return { response: null, data: null, status: null, skipped: true };
  }

  const server = app.listen(0); // Random port
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
  server.close();

  return { response, data, status: response.status };
}

/**
 * Assert that response has expected status and data
 */
export function assertResponse(result, expectedStatus, expectedData) {
  assert.equal(result.skipped, false,
    'Request skipped because sockets are unavailable in this environment');

  assert.equal(result.status, expectedStatus,
    `Expected status ${expectedStatus}, got ${result.status}`);

  if (expectedData) {
    assert.deepEqual(result.data, expectedData,
      `Response data doesn't match expected`);
  }
}

export { assert };
