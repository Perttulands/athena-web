import { describe, it, before, after } from 'node:test';
import { assert, canListen } from '../setup.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('Artifact Search Routes', () => {
  let app;
  let workspaceDir;
  let originalWorkspacePath;
  let socketsAllowed = true;

  before(async () => {
    workspaceDir = path.join(os.tmpdir(), `athena-artifact-search-routes-${Date.now()}`);

    await fs.mkdir(path.join(workspaceDir, 'docs', 'research'), { recursive: true });
    await fs.mkdir(path.join(workspaceDir, 'state', 'results'), { recursive: true });
    await fs.mkdir(path.join(workspaceDir, 'memory'), { recursive: true });

    await fs.writeFile(path.join(workspaceDir, 'docs', 'research', 'notes.md'), 'alpha artifact\nline two');
    await fs.writeFile(path.join(workspaceDir, 'state', 'results', 'summary.md'), 'beta result\nline two');

    originalWorkspacePath = process.env.WORKSPACE_PATH;
    process.env.WORKSPACE_PATH = workspaceDir;

    const server = await import(`../../server.js?artifact-search=${Date.now()}`);
    app = server.default;
    socketsAllowed = await canListen();
  });

  after(async () => {
    process.env.WORKSPACE_PATH = originalWorkspacePath;
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it('GET /api/artifacts/search finds matching content', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(
      `http://localhost:${port}/api/artifacts/search?q=alpha&roots=research,results&limit=10`
    );
    const data = await response.json();

    assert.strictEqual(response.status, 200);
    assert.ok(Array.isArray(data.results));
    assert.ok(data.results.some((result) => (
      result.root === 'research'
      && result.path === 'notes.md'
      && result.line === 1
      && typeof result.snippet === 'string'
      && result.snippet.includes('alpha')
    )));

    server.close();
  });

  it('GET /api/artifacts/search returns empty array when no matches are found', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(
      `http://localhost:${port}/api/artifacts/search?q=notfoundterm&roots=research&limit=5`
    );
    const data = await response.json();

    assert.strictEqual(response.status, 200);
    assert.deepEqual(data.results, []);

    server.close();
  });

  it('treats shell-looking input as plain text and does not execute commands', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const injectedFile = path.join(workspaceDir, 'injected.txt');
    const injectionAttempt = encodeURIComponent(`alpha; touch ${injectedFile}`);

    const response = await fetch(
      `http://localhost:${port}/api/artifacts/search?q=${injectionAttempt}&roots=research&limit=5`
    );
    const data = await response.json();

    await assert.rejects(async () => {
      await fs.stat(injectedFile);
    });

    assert.strictEqual(response.status, 200);
    assert.deepEqual(data.results, []);

    server.close();
  });

  it('rejects invalid roots in search queries', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(
      `http://localhost:${port}/api/artifacts/search?q=alpha&roots=research,unknown&limit=10`
    );
    const data = await response.json();

    assert.strictEqual(response.status, 400);
    assert.match(data.error, /Unknown artifact root/i);

    server.close();
  });
});
