import { describe, it, before, after } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { assert, canListen } from '../setup.js';

describe('Artifact Results Routes', () => {
  let app;
  let workspaceDir;
  let originalWorkspacePath;
  let socketsAllowed = true;

  before(async () => {
    workspaceDir = path.join(os.tmpdir(), `athena-artifact-results-routes-${Date.now()}`);

    await fs.mkdir(path.join(workspaceDir, 'state', 'results'), { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, 'state', 'results', 'bd-1nn.json'),
      JSON.stringify({
        bead: 'bd-1nn',
        agent: 'codex',
        status: 'done',
        started_at: '2026-02-13T09:00:00Z',
        finished_at: '2026-02-13T09:10:00Z',
        output_summary: 'Implemented artifact view',
        diff: '+const answer = 42;',
        verification: { tests: 'pass' }
      }, null, 2)
    );

    originalWorkspacePath = process.env.WORKSPACE_PATH;
    process.env.WORKSPACE_PATH = workspaceDir;

    const server = await import(`../../server.js?artifact-results=${Date.now()}`);
    app = server.default;
    socketsAllowed = await canListen();
  });

  after(async () => {
    process.env.WORKSPACE_PATH = originalWorkspacePath;
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it('GET /api/artifacts/results lists result artifacts', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://localhost:${port}/api/artifacts/results`);
    const data = await response.json();

    assert.strictEqual(response.status, 200);
    assert.ok(Array.isArray(data.artifacts));
    assert.strictEqual(data.artifacts[0].id, 'bd-1nn');
    assert.strictEqual(data.artifacts[0].agent, 'codex');

    server.close();
  });

  it('GET /api/artifacts/results/:id returns markdown-friendly detail payload', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://localhost:${port}/api/artifacts/results/bd-1nn`);
    const data = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.artifact.id, 'bd-1nn');
    assert.ok(data.markdown.includes('## Code Diff'));
    assert.ok(data.markdown.includes('```diff'));

    server.close();
  });

  it('rejects invalid artifact IDs', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://localhost:${port}/api/artifacts/results/bad$id`);

    assert.strictEqual(response.status, 400);

    server.close();
  });
});
