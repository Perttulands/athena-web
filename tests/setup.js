// Test setup and helpers for Athena Web

import { strict as assert } from 'node:assert';

/**
 * Makes a request to the test server
 */
export async function request(app, path, options = {}) {
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
  assert.equal(result.status, expectedStatus,
    `Expected status ${expectedStatus}, got ${result.status}`);

  if (expectedData) {
    assert.deepEqual(result.data, expectedData,
      `Response data doesn't match expected`);
  }
}

export { assert };
