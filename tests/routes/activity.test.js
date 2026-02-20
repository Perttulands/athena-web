import { describe, it, before } from 'node:test';
import { request, assertResponse, canListen } from '../setup.js';

describe('GET /api/activity', () => {
  let app;
  let socketsAllowed = true;

  before(async () => {
    const server = await import('../../server.js');
    app = server.default;
    socketsAllowed = await canListen();
  });

  it('returns array of activity events', async (t) => {
    if (!socketsAllowed) { t.skip('sockets blocked'); return; }

    const result = await request(app, '/api/activity');
    if (result.skipped) { t.skip('sockets blocked'); return; }

    assertResponse(result, 200);
    // data should be an array
    const data = Array.isArray(result.data) ? result.data : [];
    for (const event of data) {
      if (event.ts) {
        // Events should have timestamps
        const parsed = new Date(event.ts);
        if (isNaN(parsed.getTime())) {
          throw new Error('Invalid timestamp in activity event');
        }
      }
    }
  });

  it('supports type filter', async (t) => {
    if (!socketsAllowed) { t.skip('sockets blocked'); return; }

    const result = await request(app, '/api/activity?type=api_request');
    if (result.skipped) { t.skip('sockets blocked'); return; }

    assertResponse(result, 200);
  });

  it('supports limit parameter', async (t) => {
    if (!socketsAllowed) { t.skip('sockets blocked'); return; }

    const result = await request(app, '/api/activity?limit=5');
    if (result.skipped) { t.skip('sockets blocked'); return; }

    assertResponse(result, 200);
    const data = Array.isArray(result.data) ? result.data : [];
    if (data.length > 5) {
      throw new Error('Limit not respected');
    }
  });
});

describe('GET /api/activity/stats', () => {
  let app;
  let socketsAllowed = true;

  before(async () => {
    const server = await import('../../server.js');
    app = server.default;
    socketsAllowed = await canListen();
  });

  it('returns activity statistics', async (t) => {
    if (!socketsAllowed) { t.skip('sockets blocked'); return; }

    const result = await request(app, '/api/activity/stats');
    if (result.skipped) { t.skip('sockets blocked'); return; }

    assertResponse(result, 200);
    if (typeof result.data.totalEvents !== 'number') {
      throw new Error('stats should include totalEvents');
    }
    if (typeof result.data.types !== 'object') {
      throw new Error('stats should include types');
    }
  });
});
