import { describe, it, before, after } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { assert, canListen } from '../setup.js';

describe('Inbox Routes', () => {
  let app;
  let socketsAllowed = true;
  let inboxDir;
  let originalInboxPath;
  let originalWorkspacePath;

  before(async () => {
    const workspaceDir = path.join(os.tmpdir(), `athena-inbox-routes-${Date.now()}`);
    inboxDir = path.join(workspaceDir, 'inbox');
    await fs.mkdir(inboxDir, { recursive: true });

    originalInboxPath = process.env.INBOX_PATH;
    originalWorkspacePath = process.env.WORKSPACE_PATH;
    process.env.WORKSPACE_PATH = workspaceDir;
    process.env.INBOX_PATH = inboxDir;

    const server = await import('../../server.js');
    app = server.default;
    socketsAllowed = await canListen();
  });

  after(async () => {
    if (originalInboxPath === undefined) {
      delete process.env.INBOX_PATH;
    } else {
      process.env.INBOX_PATH = originalInboxPath;
    }

    if (originalWorkspacePath === undefined) {
      delete process.env.WORKSPACE_PATH;
    } else {
      process.env.WORKSPACE_PATH = originalWorkspacePath;
    }

    await fs.rm(path.dirname(inboxDir), { recursive: true, force: true });
  });

  it('POST /api/inbox/upload stores multipart file via inbox service', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const formData = new FormData();
    formData.append('file', new Blob(['portal payload'], { type: 'text/plain' }), 'portal.txt');

    const response = await fetch(`http://localhost:${port}/api/inbox/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.saved, true);
    assert.strictEqual(data.status, 'incoming');
    assert.strictEqual(typeof data.id, 'string');
    assert.strictEqual(data.filename.endsWith('portal.txt'), true);

    server.close();
  });

  it('POST /api/inbox/text stores JSON title/text/format payload', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://localhost:${port}/api/inbox/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'From Route Test',
        text: '# Heading',
        format: 'md'
      })
    });
    const data = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.saved, true);
    assert.strictEqual(data.status, 'incoming');
    assert.strictEqual(data.filename.endsWith('.md'), true);

    server.close();
  });

  it('GET /api/inbox/list returns queue items for selected status', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://localhost:${port}/api/inbox/list?status=incoming`);
    const data = await response.json();

    assert.strictEqual(response.status, 200);
    assert.ok(Array.isArray(data.items));
    assert.ok(data.items.length >= 2);
    assert.ok(data.items.every((item) => item.status === 'incoming'));

    server.close();
  });

  it('returns 413 for oversized uploads', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const largeBuffer = new Uint8Array(10 * 1024 * 1024 + 1);
    const formData = new FormData();
    formData.append('file', new Blob([largeBuffer], { type: 'text/plain' }), 'large.txt');

    const response = await fetch(`http://localhost:${port}/api/inbox/upload`, {
      method: 'POST',
      body: formData
    });

    assert.strictEqual(response.status, 413);
    server.close();
  });

  it('returns 429 after 10 submissions within one minute', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    let lastResponse;
    for (let index = 0; index < 11; index += 1) {
      lastResponse = await fetch(`http://localhost:${port}/api/inbox/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Rate-${index}`,
          text: 'tiny payload',
          format: 'txt'
        })
      });
    }

    assert.strictEqual(lastResponse.status, 429);
    server.close();
  });
});
