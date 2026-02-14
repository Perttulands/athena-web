import { describe, it, before, after } from 'node:test';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { createHandleTracker } from './setup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const serviceFilePath = join(projectRoot, 'athena-web.service');

describe('systemd service file', () => {
  let serviceFileContent;
  const handles = createHandleTracker();

  before(async () => {
    try {
      serviceFileContent = await readFile(serviceFilePath, 'utf-8');
    } catch (error) {
      // File doesn't exist yet - test will fail appropriately
      serviceFileContent = '';
    }
  });

  after(async () => {
    await handles.cleanup();
  });

  it('should exist', async () => {
    assert.ok(serviceFileContent.length > 0, 'Service file should exist and not be empty');
  });

  it('should contain [Unit] section with description', () => {
    assert.ok(serviceFileContent.includes('[Unit]'), 'Should have [Unit] section');
    assert.ok(serviceFileContent.includes('Description='), 'Should have Description directive');
  });

  it('should contain [Service] section with required directives', () => {
    assert.ok(serviceFileContent.includes('[Service]'), 'Should have [Service] section');
    assert.ok(serviceFileContent.includes('Type='), 'Should specify service Type');
    assert.ok(serviceFileContent.includes('User=perttu'), 'Should run as user perttu');
    assert.ok(serviceFileContent.includes('WorkingDirectory='), 'Should specify WorkingDirectory');
    assert.ok(serviceFileContent.includes('ExecStart='), 'Should specify ExecStart command');
    assert.ok(serviceFileContent.includes('Restart='), 'Should specify Restart policy');
  });

  it('should start with node server.js', () => {
    assert.ok(
      serviceFileContent.includes('node server.js'),
      'ExecStart should run node server.js'
    );
  });

  it('should have restart on failure policy', () => {
    const restartMatch = serviceFileContent.match(/Restart=([\w-]+)/);
    assert.ok(restartMatch, 'Should have Restart directive');
    assert.ok(
      ['on-failure', 'always'].includes(restartMatch[1]),
      'Should restart on-failure or always'
    );
  });

  it('should contain [Install] section with WantedBy', () => {
    assert.ok(serviceFileContent.includes('[Install]'), 'Should have [Install] section');
    assert.ok(serviceFileContent.includes('WantedBy='), 'Should have WantedBy directive');
  });

  it('should reference environment file', () => {
    assert.ok(
      serviceFileContent.includes('EnvironmentFile=') || serviceFileContent.includes('Environment='),
      'Should support environment configuration'
    );
  });

  it('should have install/uninstall instructions in comments', () => {
    const hasInstallInstructions = serviceFileContent.includes('install') ||
                                   serviceFileContent.includes('Install');
    assert.ok(hasInstallInstructions, 'Should have installation instructions in comments');
  });
});
