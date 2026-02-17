// Service for interacting with beads CLI (bd)
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import config from '../config.js';

const execFileAsync = promisify(execFile);
const BEAD_STATUS_TO_CANONICAL = Object.freeze({
  todo: 'todo',
  open: 'active',
  ready: 'active',
  active: 'active',
  in_progress: 'active',
  blocked: 'failed',
  failed: 'failed',
  error: 'failed',
  done: 'done',
  closed: 'done',
  resolved: 'done'
});

function toNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(status) {
  return String(status || 'unknown').trim().toLowerCase();
}

function toCanonicalStatus(status) {
  const normalized = normalizeStatus(status);
  return BEAD_STATUS_TO_CANONICAL[normalized] || normalized;
}

function normalizeBead(rawBead) {
  const status = normalizeStatus(rawBead?.status);

  return {
    ...rawBead,
    id: String(rawBead?.id || ''),
    title: String(rawBead?.title || ''),
    status,
    canonicalStatus: toCanonicalStatus(status),
    priority: toNumberOrNull(rawBead?.priority),
    created: rawBead?.created || rawBead?.created_at || rawBead?.createdAt || null,
    updated: rawBead?.updated || rawBead?.updated_at || rawBead?.updatedAt || null
  };
}

async function runBeadsList() {
  return execFileAsync(config.beadsCli, ['--no-db', 'list', '--json'], {
    cwd: config.workspacePath,
    timeout: 5000,
    encoding: 'utf8'
  });
}

/**
 * List beads from bd CLI
 * @param {Object} filters - Filters to apply
 * @param {string} filters.status - Filter by status (todo, active, done, failed)
 * @param {number} filters.priority - Filter by priority
 * @param {string} filters.sort - Sort by field (created, updated, priority)
 * @returns {Promise<Array>} Array of beads
 */
export async function listBeads(filters = {}) {
  try {
    // Execute bd list --json using no-db mode to avoid readonly-db writes under systemd.
    const { stdout } = await runBeadsList();

    // Parse JSON output
    let beads = [];
    try {
      const parsed = JSON.parse(stdout);
      if (Array.isArray(parsed)) {
        beads = parsed;
      } else if (Array.isArray(parsed?.issues)) {
        beads = parsed.issues;
      } else {
        console.warn('bd list output is not an array');
        return [];
      }
    } catch (parseError) {
      console.warn('Failed to parse bd list output:', parseError.message);
      return [];
    }

    const normalized = beads.map(normalizeBead);

    // Apply filters
    let filtered = normalized;

    // Filter by status
    if (filters.status) {
      const wantedStatus = normalizeStatus(filters.status);
      filtered = filtered.filter((bead) =>
        bead.status === wantedStatus || bead.canonicalStatus === wantedStatus
      );
    }

    // Filter by priority
    if (filters.priority !== undefined) {
      const priority = Number(filters.priority);
      filtered = filtered.filter(bead => bead.priority === priority);
    }

    // Sort
    const sortField = filters.sort || 'updated';
    filtered.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      // Handle dates
      if (sortField === 'created' || sortField === 'updated') {
        return new Date(bVal) - new Date(aVal); // Most recent first
      }

      // Handle numbers
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        if (sortField === 'priority') {
          return aVal - bVal; // Priority 1 before 2 before 3
        }
        return bVal - aVal;
      }

      // Handle strings
      return String(aVal).localeCompare(String(bVal));
    });

    return filtered;

  } catch (error) {
    // Check if error is due to command not found
    if (error.code === 'ENOENT' || error.message.includes('not found')) {
      console.warn('bd CLI not found - returning empty beads array');
      return [];
    }

    // Check for timeout
    if (error.killed) {
      console.warn('bd list command timed out');
      return [];
    }

    // Other errors - log and return empty
    console.warn('Error executing bd list:', error.message);
    return [];
  }
}
