import { describe, it, before, after } from 'node:test';
import { assert, canListen } from '../setup.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('Artifact Routes', () => {
  let app;
  let workspaceDir;
  let originalWorkspacePath;
  let socketsAllowed = true;

  before(async () => {
    workspaceDir = path.join(os.tmpdir(), `athena-artifact-routes-${Date.now()}`);

    await fs.mkdir(path.join(workspaceDir, 'docs', 'research', 'topic'), { recursive: true });
    await fs.mkdir(path.join(workspaceDir, 'state', 'results'), { recursive: true });
    await fs.mkdir(path.join(workspaceDir, 'memory'), { recursive: true });

    await fs.writeFile(path.join(workspaceDir, 'docs', 'research', 'notes.md'), '# Notes');
    await fs.writeFile(path.join(workspaceDir, 'docs', 'research', 'topic', 'deep.md'), '# Deep');
    await fs.writeFile(path.join(workspaceDir, 'state', 'results', 'summary.md'), '# Summary');

    originalWorkspacePath = process.env.WORKSPACE_PATH;
    process.env.WORKSPACE_PATH = workspaceDir;

    const server = await import('../../server.js');
    app = server.default;
    socketsAllowed = await canListen();
  });

  after(async () => {
    process.env.WORKSPACE_PATH = originalWorkspacePath;
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it('GET /api/artifacts/roots returns root aliases with read/write flags', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://localhost:${port}/api/artifacts/roots`);
    const data = await response.json();

    assert.strictEqual(response.status, 200);
    assert.ok(Array.isArray(data.roots));

    const aliases = data.roots.map((root) => root.alias);
    assert.deepEqual(aliases, ['research', 'results', 'prds', 'memory']);

    const memoryRoot = data.roots.find((root) => root.alias === 'memory');
    assert.strictEqual(memoryRoot.readOnly, true);
    assert.strictEqual(memoryRoot.writable, false);

    server.close();
  });

  it('GET /api/artifacts/tree returns directory listing for a root', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(
      `http://localhost:${port}/api/artifacts/tree?root=research&path=topic`
    );
    const data = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.root, 'research');
    assert.strictEqual(data.path, 'topic');
    assert.ok(Array.isArray(data.tree));
    assert.ok(data.tree.some((entry) => entry.path === 'topic/deep.md' && entry.type === 'file'));

    server.close();
  });

  it('GET /api/artifacts/doc returns markdown and metadata', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(
      `http://localhost:${port}/api/artifacts/doc?root=results&path=summary.md`
    );
    const data = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.root, 'results');
    assert.strictEqual(data.path, 'summary.md');
    assert.strictEqual(data.content, '# Summary');
    assert.strictEqual(typeof data.metadata.size, 'number');
    assert.strictEqual(typeof data.metadata.mtime, 'string');

    server.close();
  });

  it('returns 404 for invalid root alias', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(
      `http://localhost:${port}/api/artifacts/tree?root=missing&path=`
    );

    assert.strictEqual(response.status, 404);

    server.close();
  });

  it('returns 400 for path traversal attempts', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(
      `http://localhost:${port}/api/artifacts/doc?root=research&path=..%2F..%2Fetc%2Fpasswd`
    );

    assert.strictEqual(response.status, 400);

    server.close();
  });

  it('returns 404 for missing document file', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(
      `http://localhost:${port}/api/artifacts/doc?root=research&path=missing.md`
    );

    assert.strictEqual(response.status, 404);

    server.close();
  });
});
