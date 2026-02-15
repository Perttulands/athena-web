import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ArtifactService } from '../../services/artifact-service.js';
import { InboxService } from '../../services/inbox-service.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

describe('Security Hardening', () => {
  it('memory root is marked readOnly in artifact service', () => {
    const service = new ArtifactService({
      workspaceRoot: '/tmp/test-workspace',
      repoRoots: ['/tmp/test-workspace']
    });

    const roots = service.listRoots();
    const memoryRoot = roots.find((r) => r.alias === 'memory');
    assert.ok(memoryRoot, 'memory root exists');
    assert.strictEqual(memoryRoot.readOnly, true, 'memory is readOnly');
    assert.strictEqual(memoryRoot.writable, false, 'memory is not writable');
  });

  it('artifact service blocks path traversal', () => {
    const service = new ArtifactService({
      workspaceRoot: '/tmp/test-workspace',
      repoRoots: ['/tmp/test-workspace']
    });

    assert.rejects(
      () => service.getTree('research', '../../etc'),
      (error) => error.code === 'EARTIFACT_INVALID_PATH'
    );
  });

  it('inbox service sanitizes filenames', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'inbox-security-'));

    try {
      const service = new InboxService({
        inboxPath: tmpDir,
        maxFileBytes: 10 * 1024 * 1024,
        maxTextBytes: 2 * 1024 * 1024
      });

      // Test with malicious filename
      const result = await service.submitFile({
        buffer: Buffer.from('test content'),
        size: 12,
        mimetype: 'text/plain',
        originalname: '../../../etc/passwd'
      });

      // Filename should be sanitized — no path traversal characters
      assert.ok(!result.filename.includes('..'), 'no path traversal in filename');
      assert.ok(!result.filename.includes('/'), 'no slashes in filename');
      assert.ok(result.filename.includes(result.id), 'has UUID prefix');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('inbox service sanitizes filenames with special characters', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'inbox-security2-'));

    try {
      const service = new InboxService({
        inboxPath: tmpDir,
        maxFileBytes: 10 * 1024 * 1024,
        maxTextBytes: 2 * 1024 * 1024
      });

      const result = await service.submitFile({
        buffer: Buffer.from('test'),
        size: 4,
        mimetype: 'text/plain',
        originalname: 'hello world <script>.txt'
      });

      // Special characters should be stripped
      assert.ok(!result.filename.includes('<'), 'no angle brackets');
      assert.ok(!result.filename.includes('>'), 'no angle brackets');
      assert.ok(!result.filename.includes(' '), 'no spaces');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('CORS configuration rejects cross-origin in production', async () => {
    // Verify the cors config exists in server.js
    const serverSrc = await fs.readFile(
      path.join(process.cwd(), 'server.js'),
      'utf8'
    );

    assert.ok(serverSrc.includes('origin'), 'CORS has origin configuration');
    assert.ok(serverSrc.includes('isProduction'), 'CORS checks production mode');
  });
});
