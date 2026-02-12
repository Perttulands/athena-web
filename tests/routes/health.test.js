// Tests for health check endpoint
import { describe, it, before } from 'node:test';
import { request, assertResponse, assert } from '../setup.js';

describe('GET /api/health', () => {
  let app;

  before(async () => {
    // Import server app after it's created
    const server = await import('../../server.js');
    app = server.default;
  });

  it('should return status ok with 200', async () => {
    const result = await request(app, '/api/health');
    assertResponse(result, 200, { status: 'ok' });
  });

  it('should return JSON content type', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/health`);

    assert.equal(response.headers.get('content-type').includes('application/json'), true,
      'Content-Type should be application/json');

    server.close();
  });
});
