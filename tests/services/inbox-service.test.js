import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

describe('inbox-service', () => {
  let workspaceDir;
  let inboxService;

  before(async () => {
    workspaceDir = join(os.tmpdir(), `athena-inbox-workspace-${Date.now()}`);
    await fs.mkdir(workspaceDir, { recursive: true });

    process.env.WORKSPACE_PATH = workspaceDir;
    inboxService = await import(`../../services/inbox-service.js?t=${Date.now()}`);
  });

  after(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
    delete process.env.WORKSPACE_PATH;
  });

  it('creates inbox directory on first list', async () => {
    const items = await inboxService.listInbox();
    assert.deepEqual(items, []);

    const stats = await fs.stat(join(workspaceDir, 'inbox'));
    assert.equal(stats.isDirectory(), true);
  });

  it('saves text entries with metadata', async () => {
    const result = await inboxService.saveText('hello athena');

    assert.equal(result.size, Buffer.byteLength('hello athena', 'utf-8'));
    assert.ok(result.filename.startsWith('text-'));
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'path'), false);

    const saved = await fs.readFile(join(workspaceDir, 'inbox', result.filename), 'utf-8');
    assert.equal(saved, 'hello athena');
  });

  it('rejects unsupported upload type', () => {
    assert.throws(
      () => inboxService.validateUploadFile({
        buffer: Buffer.from('x'),
        size: 1,
        originalname: 'payload.exe',
        mimetype: 'application/x-msdownload'
      }),
      (error) => error.status === 415
    );
  });

  it('rejects oversized upload', () => {
    assert.throws(
      () => inboxService.validateUploadFile({
        buffer: Buffer.alloc(1),
        size: inboxService.MAX_UPLOAD_BYTES + 1,
        originalname: 'big.txt',
        mimetype: 'text/plain'
      }),
      (error) => error.status === 413
    );
  });

  it('sanitizes and saves upload files', async () => {
    const upload = await inboxService.saveFile({
      buffer: Buffer.from('artifact'),
      size: 8,
      originalname: '../../<script>alert(1)</script>.md',
      mimetype: 'text/markdown'
    });

    assert.ok(upload.filename.endsWith('.md'));
    assert.equal(upload.originalName.includes('/'), false);
    assert.equal(upload.originalName.includes('<'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(upload, 'path'), false);

    const saved = await fs.readFile(join(workspaceDir, 'inbox', upload.filename), 'utf-8');
    assert.equal(saved, 'artifact');
  });
});
