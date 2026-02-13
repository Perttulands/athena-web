import { describe, it } from 'node:test';
import assert from 'node:assert';
import app from '../../server.js';
import { canListen } from '../setup.js';

describe('Integration: Full Flow', () => {
  it('serves shell and all key API endpoints', async (t) => {
    if (!(await canListen())) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const base = `http://localhost:${port}`;

    const shell = await fetch(`${base}/`);
    const html = await shell.text();
    assert.strictEqual(shell.status, 200);
    assert.ok(html.includes('Athena'));

    const health = await fetch(`${base}/api/health`);
    assert.strictEqual(health.status, 200);

    const status = await fetch(`${base}/api/status`);
    assert.strictEqual(status.status, 200);

    const beads = await fetch(`${base}/api/beads`);
    assert.strictEqual(beads.status, 200);

    const agents = await fetch(`${base}/api/agents`);
    assert.strictEqual(agents.status, 200);

    const docsTree = await fetch(`${base}/api/docs`);
    assert.strictEqual(docsTree.status, 200);

    const runs = await fetch(`${base}/api/runs`);
    assert.strictEqual(runs.status, 200);

    server.close();
  });

  it('enforces security checks for docs traversal and invalid kill session name', async (t) => {
    if (!(await canListen())) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const base = `http://localhost:${port}`;

    const traversal = await fetch(`${base}/api/docs/../../../etc/passwd`);
    assert.strictEqual(traversal.status, 400);

    const invalidKill = await fetch(`${base}/api/agents/not-valid/kill`, {
      method: 'POST'
    });
    assert.strictEqual(invalidKill.status, 400);

    server.close();
  });
});
