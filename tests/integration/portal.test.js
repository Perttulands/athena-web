import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { canListen } from '../setup.js';

describe('Integration: Full Portal Flow', () => {
  let app;
  let workspaceDir;
  let inboxDir;
  let originalWorkspacePath;
  let originalInboxPath;
  let socketsAllowed = true;

  before(async () => {
    workspaceDir = path.join(os.tmpdir(), `athena-portal-integration-${Date.now()}`);
    inboxDir = path.join(workspaceDir, 'inbox');

    // Create artifact directories with content
    await fs.mkdir(path.join(workspaceDir, 'docs', 'research'), { recursive: true });
    await fs.mkdir(path.join(workspaceDir, 'state', 'results'), { recursive: true });
    await fs.mkdir(path.join(workspaceDir, 'memory'), { recursive: true });
    await fs.mkdir(path.join(inboxDir, 'incoming'), { recursive: true });
    await fs.mkdir(path.join(inboxDir, 'processing'), { recursive: true });
    await fs.mkdir(path.join(inboxDir, 'done'), { recursive: true });
    await fs.mkdir(path.join(inboxDir, 'failed'), { recursive: true });

    await fs.writeFile(
      path.join(workspaceDir, 'docs', 'research', 'notes.md'),
      '# Research Notes\n\nSome content about research.\n'
    );
    await fs.writeFile(
      path.join(workspaceDir, 'state', 'results', 'summary.md'),
      '# Summary\n\nResults summary.\n'
    );

    originalWorkspacePath = process.env.WORKSPACE_PATH;
    originalInboxPath = process.env.INBOX_PATH;
    process.env.WORKSPACE_PATH = workspaceDir;
    process.env.INBOX_PATH = inboxDir;

    const server = await import(`../../server.js?t=${Date.now()}`);
    app = server.default;
    socketsAllowed = await canListen();
  });

  after(async () => {
    process.env.WORKSPACE_PATH = originalWorkspacePath;
    process.env.INBOX_PATH = originalInboxPath;
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it('browse roots → open tree → read doc → search → submit text → verify queue', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const base = `http://localhost:${port}`;

    try {
      // Step 1: Browse roots
      const rootsRes = await fetch(`${base}/api/artifacts/roots`);
      assert.strictEqual(rootsRes.status, 200);
      const rootsData = await rootsRes.json();
      assert.ok(Array.isArray(rootsData.roots), 'roots is an array');
      assert.ok(rootsData.roots.length > 0, 'at least one root exists');

      const researchRoot = rootsData.roots.find((r) => r.alias === 'research');
      assert.ok(researchRoot, 'research root exists');

      // Step 2: Open tree
      const treeRes = await fetch(`${base}/api/artifacts/tree?root=research&path=`);
      assert.strictEqual(treeRes.status, 200);
      const treeData = await treeRes.json();
      assert.ok(Array.isArray(treeData.tree), 'tree is an array');
      const notesFile = treeData.tree.find((f) => f.path === 'notes.md');
      assert.ok(notesFile, 'notes.md found in tree');

      // Step 3: Read doc
      const docRes = await fetch(`${base}/api/artifacts/doc?root=research&path=notes.md`);
      assert.strictEqual(docRes.status, 200);
      const docData = await docRes.json();
      assert.ok(docData.content.includes('Research Notes'), 'doc content loaded');
      assert.ok(docData.metadata, 'metadata present');

      // Step 4: Search (ripgrep may not be available, so handle gracefully)
      const searchRes = await fetch(`${base}/api/artifacts/search?q=research&roots=research`);
      if (searchRes.status === 200) {
        const searchData = await searchRes.json();
        assert.ok(Array.isArray(searchData.results), 'search results is array');
      }
      // If rg is not installed, status 500 is acceptable in test env

      // Step 5: Submit text to inbox
      const textRes = await fetch(`${base}/api/inbox/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'integration-test',
          text: 'Test content from integration test',
          format: 'md'
        })
      });
      assert.strictEqual(textRes.status, 200);
      const textData = await textRes.json();
      assert.ok(textData.saved, 'text saved');
      assert.ok(textData.id, 'text has ID');
      assert.strictEqual(textData.status, 'incoming');

      // Step 6: Verify in queue
      const queueRes = await fetch(`${base}/api/inbox/list?status=incoming`);
      assert.strictEqual(queueRes.status, 200);
      const queueData = await queueRes.json();
      assert.ok(Array.isArray(queueData.items), 'queue items is array');
      assert.ok(queueData.items.length > 0, 'queue has items');

      const submitted = queueData.items.find((item) =>
        item.filename.includes('integration-test')
      );
      assert.ok(submitted, 'submitted text found in queue');
    } finally {
      server.close();
    }
  });

  it('all existing API endpoints still respond', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const base = `http://localhost:${port}`;

    try {
      // Health
      const health = await fetch(`${base}/api/health`);
      assert.strictEqual(health.status, 200);

      // Status
      const status = await fetch(`${base}/api/status`);
      assert.strictEqual(status.status, 200);

      // Beads
      const beads = await fetch(`${base}/api/beads`);
      assert.strictEqual(beads.status, 200);

      // Agents
      const agents = await fetch(`${base}/api/agents`);
      assert.strictEqual(agents.status, 200);

      // Docs
      const docs = await fetch(`${base}/api/docs`);
      assert.strictEqual(docs.status, 200);

      // Runs
      const runs = await fetch(`${base}/api/runs`);
      assert.strictEqual(runs.status, 200);

      // Artifacts roots
      const roots = await fetch(`${base}/api/artifacts/roots`);
      assert.strictEqual(roots.status, 200);

      // Inbox list
      const inbox = await fetch(`${base}/api/inbox`);
      assert.strictEqual(inbox.status, 200);

      // SPA fallback (non-API, no extension)
      const spa = await fetch(`${base}/portal`);
      assert.strictEqual(spa.status, 200);
      const spaHtml = await spa.text();
      assert.ok(spaHtml.includes('html'), 'SPA returns HTML');
    } finally {
      server.close();
    }
  });

  it('path traversal returns 400 on artifact routes', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const base = `http://localhost:${port}`;

    try {
      const res = await fetch(`${base}/api/artifacts/doc?root=research&path=../../etc/passwd`);
      assert.ok([400, 403].includes(res.status), 'path traversal blocked');
    } finally {
      server.close();
    }
  });
});
