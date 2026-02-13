import { describe, it, before } from 'node:test';
import { assert, canListen } from '../setup.js';

describe('GET /api/inbox', () => {
  let app;
  let socketsAllowed = true;

  before(async () => {
    const server = await import('../../server.js');
    app = server.default;
    socketsAllowed = await canListen();
  });

  it('returns list of inbox items', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/inbox`);

    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.ok(Array.isArray(data.items), 'Should return items array');

    server.close();
  });

  it('returns 400 without content', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/inbox/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    assert.strictEqual(response.status, 400);

    server.close();
  });

  it('returns 400 without file for upload', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/inbox/upload`, {
      method: 'POST'
    });

    assert.strictEqual(response.status, 400);

    server.close();
  });

  it('returns 415 for unsupported uploaded file type', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const formData = new FormData();
    formData.append(
      'file',
      new Blob(['malware'], { type: 'application/x-msdownload' }),
      'payload.exe'
    );

    const response = await fetch(`http://localhost:${port}/api/inbox/upload`, {
      method: 'POST',
      body: formData
    });

    assert.strictEqual(response.status, 415);

    server.close();
  });

  it('returns 413 for oversized uploaded files', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const largeBuffer = new Uint8Array(10 * 1024 * 1024 + 1);
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([largeBuffer], { type: 'text/plain' }),
      'large.txt'
    );

    const response = await fetch(`http://localhost:${port}/api/inbox/upload`, {
      method: 'POST',
      body: formData
    });

    assert.strictEqual(response.status, 413);

    server.close();
  });
});
