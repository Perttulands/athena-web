// Service for interacting with beads CLI (br)
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * List beads from br CLI
 * @param {Object} filters - Filters to apply
 * @param {string} filters.status - Filter by status (todo, active, done, failed)
 * @param {number} filters.priority - Filter by priority
 * @param {string} filters.sort - Sort by field (created, updated, priority)
 * @returns {Promise<Array>} Array of beads
 */
export async function listBeads(filters = {}) {
  try {
    // Execute br list --json
    const { stdout, stderr } = await execAsync('br list --json', {
      timeout: 5000, // 5 second timeout
      encoding: 'utf8'
    });

    // Parse JSON output
    let beads = [];
    try {
      beads = JSON.parse(stdout);
    } catch (parseError) {
      console.warn('Failed to parse br list output:', parseError.message);
      return [];
    }

    // Ensure beads is an array
    if (!Array.isArray(beads)) {
      console.warn('br list output is not an array');
      return [];
    }

    // Apply filters
    let filtered = beads;

    // Filter by status
    if (filters.status) {
      filtered = filtered.filter(bead => bead.status === filters.status);
    }

    // Filter by priority
    if (filters.priority !== undefined) {
      const priority = parseInt(filters.priority, 10);
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
        return bVal - aVal;
      }

      // Handle strings
      return String(bVal).localeCompare(String(aVal));
    });

    return filtered;

  } catch (error) {
    // Check if error is due to command not found
    if (error.code === 'ENOENT' || error.message.includes('not found')) {
      console.warn('br CLI not found - returning empty beads array');
      return [];
    }

    // Check for timeout
    if (error.killed) {
      console.warn('br list command timed out');
      return [];
    }

    // Other errors - log and return empty
    console.warn('Error executing br list:', error.message);
    return [];
  }
}
