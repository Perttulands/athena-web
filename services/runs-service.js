import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import config from '../config.js';

/**
 * Reads and merges run and result JSON files from state directories
 * @param {Object} filters - Query filters { status, date, agent }
 * @returns {Promise<Array>} - Array of run objects sorted by most recent first
 */
async function listRuns(filters = {}) {
  const runsDir = join(config.statePath, 'runs');
  const resultsDir = join(config.statePath, 'results');

  // Graceful degradation: return empty if directories don't exist
  let runFiles = [];
  try {
    runFiles = await readdir(runsDir);
  } catch (err) {
    // Directory doesn't exist or can't be read
    return [];
  }

  const runs = [];

  // Read all run files
  for (const filename of runFiles) {
    if (!filename.endsWith('.json')) continue;

    try {
      const runPath = join(runsDir, filename);
      const runContent = await readFile(runPath, 'utf-8');
      const run = JSON.parse(runContent);

      // Try to read corresponding result file
      const beadId = filename.replace('.json', '');
      try {
        const resultPath = join(resultsDir, filename);
        const resultContent = await readFile(resultPath, 'utf-8');
        const result = JSON.parse(resultContent);

        // Merge verification data into run
        if (result.verification) {
          run.verification = result.verification;
        }
      } catch (err) {
        // No result file or malformed - continue without verification data
      }

      runs.push(run);
    } catch (err) {
      // Malformed JSON - skip this file and log warning
      console.warn(`Skipping malformed run file: ${filename}`);
    }
  }

  // Sort by most recent first
  runs.sort((a, b) => {
    const timeA = new Date(a.started_at).getTime();
    const timeB = new Date(b.started_at).getTime();
    return timeB - timeA; // Descending order
  });

  // Apply filters
  let filtered = runs;

  if (filters.status) {
    if (filters.status === 'success') {
      filtered = filtered.filter(r => r.exit_code === 0);
    } else if (filters.status === 'failed') {
      filtered = filtered.filter(r => r.exit_code !== 0);
    }
  }

  if (filters.agent) {
    filtered = filtered.filter(r => r.agent === filters.agent);
  }

  if (filters.date) {
    // Filter by date (YYYY-MM-DD)
    filtered = filtered.filter(r => r.started_at.startsWith(filters.date));
  }

  return filtered;
}

export default {
  listRuns
};
