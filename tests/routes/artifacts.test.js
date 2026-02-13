import { describe, it, before } from 'node:test';
import { assert, canListen } from '../setup.js';

describe('GET /api/artifacts', () => {
  let app;
  let socketsAllowed = true;

  before(async () => {
    const server = await import('../../server.js');
    app = server.default;
    socketsAllowed = await canListen();
  });

  it('returns list of artifacts', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/artifacts`);

    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.ok(Array.isArray(data.artifacts), 'Should return artifacts array');

    server.close();
  });

  it('returns 400 for invalid encoding', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/artifacts/invalid!!!`);

    assert.strictEqual(response.status, 400);

    server.close();
  });

  it('returns 403 for path outside allowed directories', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const encodedPath = Buffer.from('/etc/passwd', 'utf-8').toString('base64url');
    const server = app.listen(0);
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/artifacts/${encodedPath}`);

    assert.strictEqual(response.status, 403);

    server.close();
  });
});
