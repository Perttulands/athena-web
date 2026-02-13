import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { canListen } from '../setup.js';

describe('GET /api/ralph', () => {
  let app;
  let tempDir;
  let socketsAllowed = true;

  before(async () => {
    // Create temp directory for test files
    tempDir = '/tmp/athena-web-test-ralph-' + Date.now();
    await mkdir(tempDir, { recursive: true });

    // Create test PRD file
    const prdContent = `# Test PRD

- [x] **US-001** Setup (10 min)
- [ ] **US-002** Build (20 min)
- [ ] **US-003** Test (15 min)
`;
    await writeFile(join(tempDir, 'PRD_TEST.md'), prdContent);

    // Create test progress file
    const progressContent = `current_task=US-002
iteration=1
max_iterations=5
status=running
`;
    await writeFile(join(tempDir, 'progress_test.txt'), progressContent);

    // Set workspace path for default behavior
    process.env.WORKSPACE_PATH = tempDir;

    // Import server after env is set
    const server = await import('../../server.js');
    app = server.default;
    socketsAllowed = await canListen();
  });

  after(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should return ralph status with custom paths', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const prdPath = join(tempDir, 'PRD_TEST.md');
    const progressPath = join(tempDir, 'progress_test.txt');
    const response = await fetch(
      `http://localhost:${port}/api/ralph?prd=${encodeURIComponent(prdPath)}&progress=${encodeURIComponent(progressPath)}`
    );

    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.strictEqual(data.prd, 'PRD_TEST.md');
    assert.strictEqual(data.tasks.length, 3);
    assert.strictEqual(data.tasks[0].id, 'US-001');
    assert.strictEqual(data.tasks[0].done, true);
    assert.strictEqual(data.tasks[1].id, 'US-002');
    assert.strictEqual(data.tasks[1].done, false);
    assert.strictEqual(data.currentIteration, 1);
    assert.strictEqual(data.maxIterations, 5);
    assert.strictEqual(data.activeTask, 'US-002');
    assert.strictEqual(data.prdProgress.done, 1);
    assert.strictEqual(data.prdProgress.total, 3);

    server.close();

  });

  it('should use default paths when not specified', async (t) => {
    if (!socketsAllowed) {
      t.skip('Local sockets are blocked in this environment');
      return;
    }

    const server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://localhost:${port}/api/ralph`);

    assert.strictEqual(response.status, 200);

    const data = await response.json();
    // Should have required fields even if files don't exist
    assert.ok(data.hasOwnProperty('prd'));
    assert.ok(data.hasOwnProperty('tasks'));
    assert.ok(data.hasOwnProperty('currentIteration'));
    assert.ok(data.hasOwnProperty('maxIterations'));
    assert.ok(data.hasOwnProperty('activeTask'));
    assert.ok(data.hasOwnProperty('prdProgress'));

    server.close();
  });
});
