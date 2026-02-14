import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { InboxService } from '../../services/inbox-service.js';

describe('InboxService', () => {
  let workspaceDir;
  let inboxDir;
  let service;

  before(async () => {
    workspaceDir = path.join(os.tmpdir(), `athena-inbox-service-${Date.now()}`);
    inboxDir = path.join(workspaceDir, 'inbox');
    service = new InboxService({
      inboxPath: inboxDir,
      maxFileBytes: 1024,
      maxTextBytes: 512
    });
  });

  after(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it('submits uploaded file with metadata sidecar in incoming status', async () => {
    const content = Buffer.from('artifact payload');
    const result = await service.submitFile({
      buffer: content,
      size: content.length,
      originalname: 'report.md',
      mimetype: 'text/markdown'
    }, { submitted_by: 'test-suite' });

    const filePath = path.join(inboxDir, 'incoming', result.filename);
    const sidecarPath = `${filePath}.meta.json`;

    const savedContent = await fs.readFile(filePath);
    const sidecar = JSON.parse(await fs.readFile(sidecarPath, 'utf8'));

    assert.deepEqual(savedContent, content);
    assert.equal(sidecar.id, result.metadata.id);
    assert.equal(sidecar.source, 'upload');
    assert.equal(sidecar.original_filename, 'report.md');
    assert.equal(sidecar.content_type, 'text/markdown');
    assert.equal(sidecar.size_bytes, content.length);
    assert.equal(sidecar.sha256, crypto.createHash('sha256').update(content).digest('hex'));
    assert.equal(sidecar.submitted_by, 'test-suite');
  });

  it('submits text as markdown with metadata sidecar', async () => {
    const text = '# Athena\n\nPortal text body';
    const result = await service.submitText('My Portal Note', text, 'md');

    assert.equal(result.filename.endsWith('.md'), true);

    const filePath = path.join(inboxDir, 'incoming', result.filename);
    const sidecarPath = `${filePath}.meta.json`;

    const savedText = await fs.readFile(filePath, 'utf8');
    const sidecar = JSON.parse(await fs.readFile(sidecarPath, 'utf8'));

    assert.equal(savedText, text);
    assert.equal(sidecar.source, 'text');
    assert.equal(sidecar.original_filename, 'my-portal-note.md');
    assert.equal(sidecar.content_type, 'text/markdown');
    assert.equal(sidecar.size_bytes, Buffer.byteLength(text, 'utf8'));
    assert.equal(sidecar.sha256, crypto.createHash('sha256').update(text, 'utf8').digest('hex'));
    assert.equal(typeof sidecar.created_at, 'string');
    assert.ok(sidecar.created_at.includes('T'));
  });

  it('lists files by status with parsed metadata', async () => {
    const list = await service.list('incoming');
    assert.equal(list.length, 2);

    const ids = new Set(list.map((item) => item.metadata.id));
    assert.equal(ids.size, 2);
    assert.ok(list.every((item) => item.status === 'incoming'));
    assert.ok(list.every((item) => item.metadata.sha256));
  });

  it('enforces configured size limits for file and text submissions', async () => {
    await assert.rejects(
      service.submitFile({
        buffer: Buffer.alloc(1025, 'a'),
        size: 1025,
        originalname: 'big.bin',
        mimetype: 'application/octet-stream'
      }),
      (error) => error.code === 'EINBOX_SIZE_LIMIT' && error.status === 413
    );

    await assert.rejects(
      service.submitText('too-big', 'x'.repeat(513), 'txt'),
      (error) => error.code === 'EINBOX_SIZE_LIMIT' && error.status === 413
    );
  });

  it('performs atomic writes without leaving partial temp files', async () => {
    const content = Buffer.from('atomic-file');
    await service.submitFile({
      buffer: content,
      size: content.length,
      originalname: 'atomic.txt',
      mimetype: 'text/plain'
    });

    const incomingPath = path.join(inboxDir, 'incoming');
    const entries = await fs.readdir(incomingPath);
    assert.equal(entries.some((entry) => entry.endsWith('.tmp')), false);
  });
});
