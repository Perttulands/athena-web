import { describe, it, before, after } from 'node:test';
import { assert, canListen } from '../setup.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('Docs Routes', () => {
  let app;
  let testWorkspaceDir;
  let originalWorkspacePath;
  let socketsAllowed = true;

  before(async () => {
    // Create test workspace
    testWorkspaceDir = path.join(os.tmpdir(), `athena-test-workspace-docs-${Date.now()}`);
    await fs.mkdir(testWorkspaceDir, { recursive: true });

    await fs.writeFile(path.join(testWorkspaceDir, 'README.md'), '# Test README');
    await fs.writeFile(path.join(testWorkspaceDir, 'VISION.md'), '# Vision');
    await fs.mkdir(path.join(testWorkspaceDir, 'docs'), { recursive: true });
    await fs.writeFile(path.join(testWorkspaceDir, 'docs', 'guide.md'), '# Guide');

    // Set env var before importing
    originalWorkspacePath = process.env.WORKSPACE_PATH;
    process.env.WORKSPACE_PATH = testWorkspaceDir;

    // Import server
    const server = await import('../../server.js');
    app = server.default;
    socketsAllowed = await canListen();
  });

  after(async () => {
    process.env.WORKSPACE_PATH = originalWorkspacePath;
    await fs.rm(testWorkspaceDir, { recursive: true, force: true });
  });

  describe('GET /api/docs', () => {
    it('should return the file tree', async (t) => {
      if (!socketsAllowed) {
        t.skip('Local sockets are blocked in this environment');
        return;
      }

      const server = app.listen(0);
      const port = server.address().port;

      const response = await fetch(`http://localhost:${port}/api/docs`);
      const data = await response.json();

      assert.strictEqual(response.status, 200);
      assert.ok(data.tree, 'Response should have tree property');
      assert.ok(Array.isArray(data.tree), 'Tree should be an array');
      assert.ok(data.tree.length > 0, 'Tree should have entries');

      server.close();
    });

    it('should include both files and directories', async (t) => {
      if (!socketsAllowed) {
        t.skip('Local sockets are blocked in this environment');
        return;
      }

      const server = app.listen(0);
      const port = server.address().port;

      const response = await fetch(`http://localhost:${port}/api/docs`);
      const data = await response.json();

      const hasFile = data.tree.some(item => item.type === 'file');
      const hasDir = data.tree.some(item => item.type === 'dir');

      assert.ok(hasFile, 'Tree should include files');
      assert.ok(hasDir, 'Tree should include directories');

      server.close();
    });
  });

  describe('GET /api/docs/:path', () => {
    it('should return file content for a root file', async (t) => {
      if (!socketsAllowed) {
        t.skip('Local sockets are blocked in this environment');
        return;
      }

      const server = app.listen(0);
      const port = server.address().port;

      const response = await fetch(`http://localhost:${port}/api/docs/README.md`);
      const data = await response.json();

      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.path, 'README.md');
      assert.strictEqual(data.content, '# Test README');

      server.close();
    });

    it('should return file content for a nested file', async (t) => {
      if (!socketsAllowed) {
        t.skip('Local sockets are blocked in this environment');
        return;
      }

      const server = app.listen(0);
      const port = server.address().port;

      const response = await fetch(`http://localhost:${port}/api/docs/docs/guide.md`);
      const data = await response.json();

      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.path, 'docs/guide.md');
      assert.strictEqual(data.content, '# Guide');

      server.close();
    });

    it('should return 404 for non-existent file', async (t) => {
      if (!socketsAllowed) {
        t.skip('Local sockets are blocked in this environment');
        return;
      }

      const server = app.listen(0);
      const port = server.address().port;

      const response = await fetch(`http://localhost:${port}/api/docs/does-not-exist.md`);

      assert.strictEqual(response.status, 404);

      server.close();
    });

    it('should reject path traversal attempts', async (t) => {
      if (!socketsAllowed) {
        t.skip('Local sockets are blocked in this environment');
        return;
      }

      const server = app.listen(0);
      const port = server.address().port;

      const response = await fetch(`http://localhost:${port}/api/docs/../../../etc/passwd`);

      assert.strictEqual(response.status, 400);

      server.close();
    });
  });

  describe('PUT /api/docs/:path', () => {
    it('should create a new file', async (t) => {
      if (!socketsAllowed) {
        t.skip('Local sockets are blocked in this environment');
        return;
      }

      const server = app.listen(0);
      const port = server.address().port;

      const newContent = '# New Test File';
      const response = await fetch(`http://localhost:${port}/api/docs/NEW_TEST.md`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent })
      });
      const data = await response.json();

      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.saved, true);
      assert.strictEqual(data.path, 'NEW_TEST.md');

      // Verify file was actually written
      const written = await fs.readFile(path.join(testWorkspaceDir, 'NEW_TEST.md'), 'utf8');
      assert.strictEqual(written, newContent);

      server.close();
    });

    it('should update an existing file', async (t) => {
      if (!socketsAllowed) {
        t.skip('Local sockets are blocked in this environment');
        return;
      }

      const server = app.listen(0);
      const port = server.address().port;

      const updatedContent = '# Updated README';
      const response = await fetch(`http://localhost:${port}/api/docs/README.md`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: updatedContent })
      });
      const data = await response.json();

      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.saved, true);

      // Verify file was updated
      const written = await fs.readFile(path.join(testWorkspaceDir, 'README.md'), 'utf8');
      assert.strictEqual(written, updatedContent);

      server.close();
    });

    it('should reject path traversal attempts', async (t) => {
      if (!socketsAllowed) {
        t.skip('Local sockets are blocked in this environment');
        return;
      }

      const server = app.listen(0);
      const port = server.address().port;

      const response = await fetch(`http://localhost:${port}/api/docs/../../../tmp/malicious.txt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'bad' })
      });

      assert.strictEqual(response.status, 400);

      server.close();
    });

    it('should require content in request body', async (t) => {
      if (!socketsAllowed) {
        t.skip('Local sockets are blocked in this environment');
        return;
      }

      const server = app.listen(0);
      const port = server.address().port;

      const response = await fetch(`http://localhost:${port}/api/docs/test.md`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      assert.strictEqual(response.status, 400);

      server.close();
    });
  });
});
