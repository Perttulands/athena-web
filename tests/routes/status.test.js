import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, makeRequest } from '../setup.js';

describe('GET /api/status', () => {
  let server;
  let baseURL;

  before(async () => {
    const result = await startTestServer();
    server = result.server;
    baseURL = result.baseURL;
  });

  after(() => stopTestServer(server));

  it('returns aggregate dashboard data', async () => {
    const res = await makeRequest(`${baseURL}/api/status`);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.ok(data.athena);
    assert.ok(data.agents);
    assert.ok(data.beads);
    assert.ok(data.ralph);
    assert.ok(Array.isArray(data.recentActivity));
  });

  it('includes athena status fields', async () => {
    const res = await makeRequest(`${baseURL}/api/status`);
    const data = await res.json();

    assert.ok('status' in data.athena);
    assert.ok('lastMessage' in data.athena);
    assert.ok('lastSeen' in data.athena);
  });

  it('includes agents stats', async () => {
    const res = await makeRequest(`${baseURL}/api/status`);
    const data = await res.json();

    assert.ok(typeof data.agents.running === 'number');
    assert.ok(typeof data.agents.total === 'number');
    assert.ok(typeof data.agents.successRate === 'number');
  });

  it('includes beads stats', async () => {
    const res = await makeRequest(`${baseURL}/api/status`);
    const data = await res.json();

    assert.ok(typeof data.beads.todo === 'number');
    assert.ok(typeof data.beads.active === 'number');
    assert.ok(typeof data.beads.done === 'number');
    assert.ok(typeof data.beads.failed === 'number');
  });

  it('includes ralph stats', async () => {
    const res = await makeRequest(`${baseURL}/api/status`);
    const data = await res.json();

    assert.ok('currentTask' in data.ralph);
    assert.ok('iteration' in data.ralph);
    assert.ok('maxIterations' in data.ralph);
    assert.ok(data.ralph.prdProgress);
    assert.ok(typeof data.ralph.prdProgress.done === 'number');
    assert.ok(typeof data.ralph.prdProgress.total === 'number');
  });

  it('includes recent activity array', async () => {
    const res = await makeRequest(`${baseURL}/api/status`);
    const data = await res.json();

    assert.ok(Array.isArray(data.recentActivity));
    assert.ok(data.recentActivity.length <= 10);
  });

  it('handles service failures gracefully', async () => {
    // The status endpoint should return partial data even if some services fail
    // We can't easily simulate service failures in this test, but we verify
    // that the endpoint never returns 500
    const res = await makeRequest(`${baseURL}/api/status`);

    assert.ok(res.status < 500, 'Status endpoint should not return 500 even on partial failures');
  });
});
