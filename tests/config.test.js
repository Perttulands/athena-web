// Tests for config module
import { describe, it } from 'node:test';
import { assert } from './setup.js';
import { join } from 'node:path';

describe('Config', () => {
  it('should load config values from environment', async () => {
    // Set test environment variables
    process.env.WORKSPACE_PATH = '/test/workspace';
    process.env.PORT = '9001';

    const config = await import('../config.js');

    assert.equal(config.default.workspacePath, '/test/workspace',
      'Should load workspace path from env');
    assert.equal(config.default.port, 9001,
      'Should load port from env as number');
  });

  it('should use default values when env not set', async () => {
    // Clear env vars
    delete process.env.WORKSPACE_PATH;
    delete process.env.PORT;

    // Import with cache-busting query string
    const config = await import(`../config.js?${Date.now()}`);

    assert.equal(typeof config.default.workspacePath, 'string',
      'Should have default workspace path');
    assert.equal(config.default.port, 9000,
      'Should default to port 9000');
  });

  it('should include all required config values', async () => {
    const config = await import('../config.js');

    assert.ok(config.default.workspacePath, 'Should have workspacePath');
    assert.ok(config.default.statePath, 'Should have statePath');
    assert.ok(config.default.beadsCli, 'Should have beadsCli');
    assert.ok(config.default.port, 'Should have port');
  });

  it('default config works out of the box', async () => {
    delete process.env.WORKSPACE_PATH;
    delete process.env.INBOX_PATH;
    delete process.env.MAX_UPLOAD_BYTES;
    delete process.env.MAX_TEXT_BYTES;
    delete process.env.ARTIFACT_ROOTS;

    const { default: config } = await import(`../config.js?defaults=${Date.now()}`);

    assert.ok(config.workspacePath.includes('.openclaw'), 'workspace path includes .openclaw');
    assert.ok(config.inboxPath.endsWith('inbox'), 'inbox path ends with inbox');
    assert.equal(config.maxUploadBytes, 10 * 1024 * 1024, 'maxUploadBytes defaults to 10MB');
    assert.equal(config.maxTextBytes, 2 * 1024 * 1024, 'maxTextBytes defaults to 2MB');
    assert.ok(Array.isArray(config.artifactRoots), 'artifactRoots is an array');
    assert.equal(config.artifactRoots.length, 1, 'artifactRoots has one entry');
    assert.equal(config.artifactRoots[0], config.workspacePath, 'artifactRoots defaults to workspacePath');
  });

  it('custom config overrides work', async () => {
    const saved = {};
    for (const key of ['INBOX_PATH', 'MAX_UPLOAD_BYTES', 'MAX_TEXT_BYTES', 'ARTIFACT_ROOTS']) {
      saved[key] = process.env[key];
    }

    process.env.INBOX_PATH = '/tmp/custom-inbox';
    process.env.MAX_UPLOAD_BYTES = '5242880';
    process.env.MAX_TEXT_BYTES = '1048576';
    process.env.ARTIFACT_ROOTS = '/tmp/repo-a, /tmp/repo-b';

    try {
      const { default: config } = await import(`../config.js?custom=${Date.now()}`);

      assert.equal(config.inboxPath, '/tmp/custom-inbox');
      assert.equal(config.maxUploadBytes, 5242880);
      assert.equal(config.maxTextBytes, 1048576);
      assert.deepStrictEqual(config.artifactRoots, ['/tmp/repo-a', '/tmp/repo-b']);
    } finally {
      for (const key of Object.keys(saved)) {
        if (saved[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = saved[key];
        }
      }
    }
  });

  it('inboxPath derives from workspacePath when not overridden', async () => {
    const savedInbox = process.env.INBOX_PATH;
    const savedWs = process.env.WORKSPACE_PATH;
    delete process.env.INBOX_PATH;
    process.env.WORKSPACE_PATH = '/tmp/ws-test';

    try {
      const { default: config } = await import(`../config.js?derive=${Date.now()}`);
      assert.equal(config.inboxPath, join('/tmp/ws-test', 'inbox'));
    } finally {
      if (savedInbox !== undefined) process.env.INBOX_PATH = savedInbox;
      else delete process.env.INBOX_PATH;
      if (savedWs !== undefined) process.env.WORKSPACE_PATH = savedWs;
      else delete process.env.WORKSPACE_PATH;
    }
  });
});
