import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create a temporary test state directory
const testStateDir = join(__dirname, '../tmp/state');
const testRunsDir = join(testStateDir, 'runs');
const testResultsDir = join(testStateDir, 'results');

describe('runs-service', () => {
  let listRuns;

  before(async () => {
    // Create temp directories
    await mkdir(testRunsDir, { recursive: true });
    await mkdir(testResultsDir, { recursive: true });

    // Create sample run files
    await writeFile(
      join(testRunsDir, 'bd-279.json'),
      JSON.stringify({
        bead: 'bd-279',
        agent: 'claude',
        model: 'sonnet',
        started_at: '2026-02-12T10:00:00Z',
        finished_at: '2026-02-12T10:15:00Z',
        exit_code: 0,
        attempt: 1
      })
    );

    await writeFile(
      join(testRunsDir, 'bd-280.json'),
      JSON.stringify({
        bead: 'bd-280',
        agent: 'claude',
        model: 'haiku',
        started_at: '2026-02-12T09:00:00Z',
        finished_at: '2026-02-12T09:30:00Z',
        exit_code: 1,
        attempt: 2
      })
    );

    // Create sample result files
    await writeFile(
      join(testResultsDir, 'bd-279.json'),
      JSON.stringify({
        verification: {
          lint: 'pass',
          tests: 'pass',
          ubs: 'clean'
        }
      })
    );

    await writeFile(
      join(testResultsDir, 'bd-280.json'),
      JSON.stringify({
        verification: {
          lint: 'fail',
          tests: 'pass',
          ubs: 'clean'
        }
      })
    );

    // Create malformed JSON file to test error handling
    await writeFile(
      join(testRunsDir, 'bd-999.json'),
      'this is not valid JSON'
    );

    // Import the service with test state path
    process.env.STATE_PATH = testStateDir;
    const { default: runsService } = await import('../../services/runs-service.js?' + Date.now());
    listRuns = runsService.listRuns;
  });

  after(async () => {
    // Clean up temp directory
    await rm(testStateDir, { recursive: true, force: true });
  });

  it('should list all runs merged with results', async () => {
    const runs = await listRuns();

    assert.equal(runs.length, 2, 'should return 2 valid runs');

    // First run (most recent)
    assert.equal(runs[0].bead, 'bd-279');
    assert.equal(runs[0].agent, 'claude');
    assert.equal(runs[0].model, 'sonnet');
    assert.equal(runs[0].exit_code, 0);
    assert.deepEqual(runs[0].verification, {
      lint: 'pass',
      tests: 'pass',
      ubs: 'clean'
    });
  });

  it('should sort by most recent first', async () => {
    const runs = await listRuns();

    assert.equal(runs[0].bead, 'bd-279', 'first run should be most recent');
    assert.equal(runs[1].bead, 'bd-280', 'second run should be older');
    assert.ok(runs[0].started_at > runs[1].started_at, 'should be sorted by time');
  });

  it('should filter by status (success)', async () => {
    const runs = await listRuns({ status: 'success' });

    assert.equal(runs.length, 1);
    assert.equal(runs[0].bead, 'bd-279');
    assert.equal(runs[0].exit_code, 0);
  });

  it('should filter by status (failed)', async () => {
    const runs = await listRuns({ status: 'failed' });

    assert.equal(runs.length, 1);
    assert.equal(runs[0].bead, 'bd-280');
    assert.equal(runs[0].exit_code, 1);
  });

  it('should filter by agent', async () => {
    const runs = await listRuns({ agent: 'claude' });

    assert.equal(runs.length, 2);
    assert.ok(runs.every(r => r.agent === 'claude'));
  });

  it('should filter by bead id', async () => {
    const runs = await listRuns({ bead: 'bd-280' });

    assert.equal(runs.length, 1);
    assert.equal(runs[0].bead, 'bd-280');
  });

  it('should filter by date', async () => {
    const runs = await listRuns({ date: '2026-02-12' });

    assert.equal(runs.length, 2);
    assert.ok(runs.every(r => r.started_at.startsWith('2026-02-12')));
  });

  it('should handle missing verification data', async () => {
    // Remove result file for bd-280
    await rm(join(testResultsDir, 'bd-280.json'), { force: true });

    const runs = await listRuns();
    const run280 = runs.find(r => r.bead === 'bd-280');

    assert.equal(run280.verification, undefined);
  });

  it('should skip malformed JSON files', async () => {
    const runs = await listRuns();

    // Should not include bd-999 (malformed JSON)
    assert.ok(!runs.some(r => r.bead === 'bd-999'));
  });
});
