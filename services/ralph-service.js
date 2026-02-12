import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

/**
 * Parses a PRD markdown file for checkbox tasks
 * Extracts tasks matching: - [ ] **US-XXX** or - [x] **US-XXX**
 * @param {string} prdPath - Path to PRD file
 * @returns {Promise<Array>} - Array of task objects { id, title, done }
 */
async function parsePRD(prdPath) {
  try {
    const content = await readFile(prdPath, 'utf-8');
    const lines = content.split('\n');
    const tasks = [];

    // Regex: - [ ] **US-XXX** Title or - [x] **US-XXX** Title
    const taskRegex = /^- \[([ x])\] \*\*([A-Z]+-\d+[a-z]?)\*\* (.+?)(?:\s+\(\d+\s+min\))?$/;

    for (const line of lines) {
      const match = line.match(taskRegex);
      if (match) {
        const done = match[1] === 'x';
        const id = match[2];
        const title = match[3];
        tasks.push({ id, title, done });
      }
    }

    return tasks;
  } catch (err) {
    // File doesn't exist or can't be read
    return [];
  }
}

/**
 * Parses a progress file for iteration info
 * Reads key=value pairs: current_task, iteration, max_iterations
 * @param {string} progressPath - Path to progress file
 * @returns {Promise<Object>} - Object with iteration info
 */
async function parseProgress(progressPath) {
  try {
    const content = await readFile(progressPath, 'utf-8');
    const lines = content.split('\n');
    const progress = {};

    for (const line of lines) {
      const [key, value] = line.split('=');
      if (key && value) {
        progress[key.trim()] = value.trim();
      }
    }

    return {
      currentTask: progress.current_task || null,
      iteration: parseInt(progress.iteration) || 0,
      maxIterations: parseInt(progress.max_iterations) || 0
    };
  } catch (err) {
    // File doesn't exist or can't be read
    return {
      currentTask: null,
      iteration: 0,
      maxIterations: 0
    };
  }
}

/**
 * Gets Ralph status by parsing PRD and progress files
 * @param {string} prdPath - Path to PRD markdown file
 * @param {string} progressPath - Path to progress text file (nullable)
 * @returns {Promise<Object>} - Ralph status object
 */
async function getRalphStatus(prdPath, progressPath) {
  const tasks = await parsePRD(prdPath);
  const progress = progressPath ? await parseProgress(progressPath) : {
    currentTask: null,
    iteration: 0,
    maxIterations: 0
  };

  // Calculate PRD progress
  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;

  return {
    prd: tasks.length > 0 ? basename(prdPath) : null,
    tasks,
    currentIteration: progress.iteration,
    maxIterations: progress.maxIterations,
    activeTask: progress.currentTask,
    prdProgress: { done, total }
  };
}

export default {
  getRalphStatus
};
