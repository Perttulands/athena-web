import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as docsService from '../../services/docs-service.js';

describe('DocsService', () => {
  let testWorkspaceDir;

  before(async () => {
    // Create a temporary workspace directory structure for testing
    testWorkspaceDir = path.join(os.tmpdir(), `athena-test-workspace-${Date.now()}`);
    await fs.mkdir(testWorkspaceDir, { recursive: true });

    // Create test file structure
    await fs.writeFile(path.join(testWorkspaceDir, 'README.md'), '# Test README');
    await fs.writeFile(path.join(testWorkspaceDir, 'VISION.md'), '# Vision\nTest content');

    await fs.mkdir(path.join(testWorkspaceDir, 'docs'), { recursive: true });
    await fs.writeFile(path.join(testWorkspaceDir, 'docs', 'guide.md'), '# Guide');

    await fs.mkdir(path.join(testWorkspaceDir, 'docs', 'api'), { recursive: true });
    await fs.writeFile(path.join(testWorkspaceDir, 'docs', 'api', 'reference.md'), '# API Reference');
  });

  after(async () => {
    // Clean up test directory
    await fs.rm(testWorkspaceDir, { recursive: true, force: true });
  });

  describe('getTree', () => {
    it('should build a tree of all files and directories', async () => {
      const tree = await docsService.getTree(testWorkspaceDir);

      assert.ok(Array.isArray(tree), 'Tree should be an array');
      assert.ok(tree.length > 0, 'Tree should have entries');

      // Check for files
      const readme = tree.find(item => item.path === 'README.md');
      assert.strictEqual(readme.type, 'file');

      // Check for directories
      const docsDir = tree.find(item => item.path === 'docs');
      assert.strictEqual(docsDir.type, 'dir');
      assert.ok(Array.isArray(docsDir.children), 'Directory should have children array');
    });

    it('should handle nested directories correctly', async () => {
      const tree = await docsService.getTree(testWorkspaceDir);
      const docsDir = tree.find(item => item.path === 'docs');

      assert.ok(docsDir.children.length >= 2, 'docs should have at least guide.md and api/');

      const apiDir = docsDir.children.find(item => item.path === 'docs/api');
      assert.strictEqual(apiDir.type, 'dir');
      assert.ok(apiDir.children.length > 0, 'api directory should have children');
    });

    it('should handle empty directory gracefully', async () => {
      const emptyDir = path.join(os.tmpdir(), `athena-test-empty-${Date.now()}`);
      await fs.mkdir(emptyDir, { recursive: true });

      const tree = await docsService.getTree(emptyDir);
      assert.ok(Array.isArray(tree), 'Should return array for empty directory');
      assert.strictEqual(tree.length, 0, 'Array should be empty');

      await fs.rm(emptyDir, { recursive: true });
    });
  });

  describe('readDoc', () => {
    it('should read a file at the root', async () => {
      const content = await docsService.readDoc(testWorkspaceDir, 'README.md');
      assert.strictEqual(content, '# Test README');
    });

    it('should read a file in a subdirectory', async () => {
      const content = await docsService.readDoc(testWorkspaceDir, 'docs/guide.md');
      assert.strictEqual(content, '# Guide');
    });

    it('should read a deeply nested file', async () => {
      const content = await docsService.readDoc(testWorkspaceDir, 'docs/api/reference.md');
      assert.strictEqual(content, '# API Reference');
    });

    it('should reject path traversal attempts with ..', async () => {
      await assert.rejects(
        async () => await docsService.readDoc(testWorkspaceDir, '../../../etc/passwd'),
        { message: /outside workspace/ },
        'Should reject path traversal'
      );
    });

    it('should reject absolute paths', async () => {
      await assert.rejects(
        async () => await docsService.readDoc(testWorkspaceDir, '/etc/passwd'),
        { message: /outside workspace/ },
        'Should reject absolute paths'
      );
    });

    it('should throw error for non-existent file', async () => {
      await assert.rejects(
        async () => await docsService.readDoc(testWorkspaceDir, 'does-not-exist.md'),
        'Should throw for non-existent file'
      );
    });
  });

  describe('writeDoc', () => {
    it('should write a new file', async () => {
      const newContent = '# New Document\nContent here';
      await docsService.writeDoc(testWorkspaceDir, 'NEW.md', newContent);

      const content = await fs.readFile(path.join(testWorkspaceDir, 'NEW.md'), 'utf8');
      assert.strictEqual(content, newContent);
    });

    it('should overwrite an existing file', async () => {
      const updatedContent = '# Updated README';
      await docsService.writeDoc(testWorkspaceDir, 'README.md', updatedContent);

      const content = await fs.readFile(path.join(testWorkspaceDir, 'README.md'), 'utf8');
      assert.strictEqual(content, updatedContent);
    });

    it('should write to a subdirectory', async () => {
      const content = '# New Guide Section';
      await docsService.writeDoc(testWorkspaceDir, 'docs/new-guide.md', content);

      const written = await fs.readFile(path.join(testWorkspaceDir, 'docs', 'new-guide.md'), 'utf8');
      assert.strictEqual(written, content);
    });

    it('should reject path traversal attempts with ..', async () => {
      await assert.rejects(
        async () => await docsService.writeDoc(testWorkspaceDir, '../../../tmp/malicious.txt', 'bad'),
        { message: /outside workspace/ },
        'Should reject path traversal'
      );
    });

    it('should reject absolute paths', async () => {
      await assert.rejects(
        async () => await docsService.writeDoc(testWorkspaceDir, '/tmp/malicious.txt', 'bad'),
        { message: /outside workspace/ },
        'Should reject absolute paths'
      );
    });
  });
});
