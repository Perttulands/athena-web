import { describe, it, before, after } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { assert, canListen } from '../setup.js';

describe('Inbox Message Routes', () => {
  let app;
  let workspaceDir;
  let originalWorkspacePath;
  let originalInboxPath;
  let socketsAllowed = true;

  before(async () => {
    workspaceDir = path.join(os.tmpdir(), `athena-inbox-messages-routes-${Date.now()}`);
    const inboxDir = path.join(workspaceDir, 'inbox');
    const stateDir = path.join(workspaceDir, 'state');

    await fs.mkdir(inboxDir, { recursive: true });
    await fs.mkdir(stateDir, { recursive: true });

    await fs.writeFile(
      path.join(stateDir, 'messages.json'),
      JSON.stringify({
        messages: [
          {
            id: 'msg-1',
            title: 'Artifact Ready',
            body: 'bd-1nn is done.',
            from: 'agent-bd-1nn',
            level: 'normal',
            createdAt: '2026-02-13T10:00:00Z'
          },
          {
            id: 'msg-2',
            title: 'Test Failure',
            body: 'One test failed.',
            from: 'agent-bd-2rv',
            level: 'high',
            createdAt: '2026-02-13T11:00:00Z'
          }
        ]
      }, null, 2)
    );

    originalWorkspacePath = process.env.WORKSPACE_PATH;
    originalInboxPath = process.env.INBOX_PATH;
    process.env.WORKSPACE_PATH = workspaceDir;
    process.env.INBOX_PATH = inboxDir;

    const server = await import(`../../server.js?inbox-messages=${Date.now()}`);
    app = server.default;
    socketsAllowed = await canListen();
  });

  after(async () => {
    process.env.WORKSPACE_PATH = originalWorkspacePath;
    process.env.INBOX_PATH = originalInboxPath;
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it('GET /api/inbox/messages returns normalized notifications', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://localhost:${port}/api/inbox/messages`);
    const data = await response.json();

    assert.strictEqual(response.status, 200);
    assert.ok(Array.isArray(data.messages));
    assert.strictEqual(data.messages.length, 2);
    assert.strictEqual(data.messages[0].id, 'msg-2');
    assert.strictEqual(data.messages[0].level, 'high');
    assert.ok(data.source?.includes('state/messages.json'));

    server.close();
  });
});
