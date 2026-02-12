// Tests for config module
import { describe, it } from 'node:test';
import { assert } from './setup.js';

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
});
