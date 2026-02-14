import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Ralph Service', () => {
  let ralphService;
  let tempDir;

  it('should extract tasks from PRD markdown', async () => {
    // Create temp directory with test PRD
    tempDir = join(__dirname, `temp-ralph-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    const prdContent = `# PRD Test

Some intro text.

- [x] **US-001** Setup project (10 min)
- [ ] **US-002** Add auth (20 min)
- [x] **US-003** Write tests (15 min)
- [ ] **US-004** Deploy (30 min)

More text.
`;

    const prdPath = join(tempDir, 'PRD_TEST.md');
    await writeFile(prdPath, prdContent);

    // Import service with temp config
    const originalWorkspace = process.env.WORKSPACE_PATH;
    process.env.WORKSPACE_PATH = tempDir;

    // Bust cache and reload
    const modulePath = `../../services/ralph-service.js?t=${Date.now()}`;
    ralphService = await import(modulePath);

    const status = await ralphService.default.getRalphStatus(prdPath, null);

    assert.equal(status.prd, 'PRD_TEST.md');
    assert.equal(status.tasks.length, 4);
    assert.equal(status.tasks[0].id, 'US-001');
    assert.equal(status.tasks[0].title, 'Setup project');
    assert.equal(status.tasks[0].done, true);
    assert.equal(status.tasks[1].id, 'US-002');
    assert.equal(status.tasks[1].title, 'Add auth');
    assert.equal(status.tasks[1].done, false);

    // Cleanup
    process.env.WORKSPACE_PATH = originalWorkspace;
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should parse progress file for iteration info', async () => {
    // Create temp directory with test progress file
    tempDir = join(__dirname, `temp-ralph-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    const progressContent = `current_task=US-003
iteration=2
max_iterations=5
status=running
`;

    const progressPath = join(tempDir, 'progress_test.txt');
    await writeFile(progressPath, progressContent);

    const prdPath = join(tempDir, 'PRD_TEST.md');
    await writeFile(prdPath, '- [ ] **US-003** Test task (10 min)');

    // Import service with temp config
    const originalWorkspace = process.env.WORKSPACE_PATH;
    process.env.WORKSPACE_PATH = tempDir;

    // Bust cache and reload
    const modulePath = `../../services/ralph-service.js?t=${Date.now()}`;
    ralphService = await import(modulePath);

    const status = await ralphService.default.getRalphStatus(prdPath, progressPath);

    assert.equal(status.currentIteration, 2);
    assert.equal(status.maxIterations, 5);
    assert.equal(status.activeTask, 'US-003');

    // Cleanup
    process.env.WORKSPACE_PATH = originalWorkspace;
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should derive completedTasks and totalTasks from PRD, not progress', async () => {
    tempDir = join(__dirname, `temp-ralph-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    const prdContent = `- [x] **US-001** Done task
- [ ] **US-002** Not done
- [x] **US-003** Done task
`;

    const progressContent = `current_task=US-099
iteration=99
max_iterations=999
status=running
`;

    const prdPath = join(tempDir, 'PRD_TEST.md');
    const progressPath = join(tempDir, 'progress_test.txt');
    await writeFile(prdPath, prdContent);
    await writeFile(progressPath, progressContent);

    const originalWorkspace = process.env.WORKSPACE_PATH;
    process.env.WORKSPACE_PATH = tempDir;

    const modulePath = `../../services/ralph-service.js?t=${Date.now()}`;
    ralphService = await import(modulePath);

    const status = await ralphService.default.getRalphStatus(prdPath, progressPath);

    assert.equal(status.completedTasks, 2);
    assert.equal(status.totalTasks, 3);
    assert.deepEqual(status.prdProgress, { done: 2, total: 3 });
    assert.equal(status.currentIteration, 99);
    assert.equal(status.maxIterations, 999);

    process.env.WORKSPACE_PATH = originalWorkspace;
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should handle missing PRD file gracefully', async () => {
    tempDir = join(__dirname, `temp-ralph-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    const originalWorkspace = process.env.WORKSPACE_PATH;
    process.env.WORKSPACE_PATH = tempDir;

    const modulePath = `../../services/ralph-service.js?t=${Date.now()}`;
    ralphService = await import(modulePath);

    const status = await ralphService.default.getRalphStatus(
      join(tempDir, 'NONEXISTENT.md'),
      null
    );

    assert.equal(status.prd, null);
    assert.equal(status.tasks.length, 0);
    assert.equal(status.currentIteration, 0);
    assert.equal(status.maxIterations, 0);

    // Cleanup
    process.env.WORKSPACE_PATH = originalWorkspace;
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should handle missing progress file gracefully', async () => {
    tempDir = join(__dirname, `temp-ralph-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    const prdPath = join(tempDir, 'PRD_TEST.md');
    await writeFile(prdPath, '- [ ] **US-001** Test (10 min)');

    const originalWorkspace = process.env.WORKSPACE_PATH;
    process.env.WORKSPACE_PATH = tempDir;

    const modulePath = `../../services/ralph-service.js?t=${Date.now()}`;
    ralphService = await import(modulePath);

    const status = await ralphService.default.getRalphStatus(
      prdPath,
      join(tempDir, 'NONEXISTENT.txt')
    );

    assert.equal(status.tasks.length, 1);
    assert.equal(status.currentIteration, 0);
    assert.equal(status.maxIterations, 0);
    assert.equal(status.activeTask, null);

    // Cleanup
    process.env.WORKSPACE_PATH = originalWorkspace;
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should calculate PRD progress', async () => {
    tempDir = join(__dirname, `temp-ralph-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    const prdContent = `- [x] **US-001** Done task
- [x] **US-002** Another done
- [ ] **US-003** Not done
- [ ] **US-004** Also not done
`;

    const prdPath = join(tempDir, 'PRD_TEST.md');
    await writeFile(prdPath, prdContent);

    const originalWorkspace = process.env.WORKSPACE_PATH;
    process.env.WORKSPACE_PATH = tempDir;

    const modulePath = `../../services/ralph-service.js?t=${Date.now()}`;
    ralphService = await import(modulePath);

    const status = await ralphService.default.getRalphStatus(prdPath, null);

    assert.equal(status.prdProgress.done, 2);
    assert.equal(status.prdProgress.total, 4);

    // Cleanup
    process.env.WORKSPACE_PATH = originalWorkspace;
    await rm(tempDir, { recursive: true, force: true });
  });
});
