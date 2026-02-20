import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Agent Output Streaming (AW-023)', () => {
  let agentsRoute, sseClient;

  it('should load route and client files', async () => {
    agentsRoute = await readFile(join(root, 'routes/agents.js'), 'utf-8');
    sseClient = await readFile(join(root, 'public/js/sse.js'), 'utf-8');
    assert.ok(agentsRoute.length > 0);
    assert.ok(sseClient.length > 0);
  });

  it('agents route should have /:name/stream SSE endpoint', () => {
    assert.ok(agentsRoute.includes("'/:name/stream'"));
    assert.ok(agentsRoute.includes('text/event-stream'));
  });

  it('stream endpoint should validate session name', () => {
    assert.ok(agentsRoute.includes('isValidSessionName'));
  });

  it('stream endpoint should send agent_output events', () => {
    assert.ok(agentsRoute.includes('agent_output'));
  });

  it('stream endpoint should send agent_error on failure', () => {
    assert.ok(agentsRoute.includes('agent_error'));
  });

  it('stream endpoint should poll with interval', () => {
    assert.ok(agentsRoute.includes('setInterval'));
    assert.ok(agentsRoute.includes('clearInterval'));
  });

  it('stream endpoint should clean up on connection close', () => {
    assert.ok(agentsRoute.includes("req.on('close'"));
    assert.ok(agentsRoute.includes('closed = true'));
  });

  it('SSE client should register agent_output and agent_error event types', () => {
    assert.ok(sseClient.includes("'agent_output'"));
    assert.ok(sseClient.includes("'agent_error'"));
  });
});
