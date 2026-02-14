// Tests for health check endpoint
import { describe, it, before } from 'node:test';
import { request, assertResponse, assert, canListen } from '../setup.js';

describe('GET /api/health', () => {
  let app;
  let socketsAllowed = true;

  before(async () => {
    // Import server app after it's created
    const server = await import('../../server.js');
    app = server.default;
    socketsAllowed = await canListen();
  });

  it('should return status ok with 200', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const result = await request(app, '/api/health');
    if (!result || result.skipped) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    assertResponse(result, 200, { status: 'ok' });
  });

  it('should return JSON content type', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const result = await request(app, '/api/health');
    if (!result || result.skipped) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    assert.equal(result.response.headers.get('content-type').includes('application/json'), true,
      'Content-Type should be application/json');
  });
});
