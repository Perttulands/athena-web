/**
 * Activity persistence service.
 * Logs activity events (page views, API calls, errors) to a JSONL file
 * so they survive server restarts. Provides query API for recent activity.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import config from '../config.js';

const MAX_FILE_BYTES = 512 * 1024; // 512 KB before rotation
const MAX_QUERY_RESULTS = 200;

class ActivityService {
  constructor(options = {}) {
    this.stateDir = options.stateDir || join(config.statePath, 'activity');
    this.maxFileBytes = options.maxFileBytes || MAX_FILE_BYTES;
    this._initPromise = null;
    this._writeQueue = Promise.resolve();
  }

  get filePath() {
    return join(this.stateDir, 'events.jsonl');
  }

  get archivePath() {
    return join(this.stateDir, 'events.prev.jsonl');
  }

  async _ensureDir() {
    if (!this._initPromise) {
      this._initPromise = fs.mkdir(this.stateDir, { recursive: true });
    }
    return this._initPromise;
  }

  /**
   * Record an activity event. Writes are serialized to avoid corruption.
   */
  record(event) {
    const entry = {
      ts: new Date().toISOString(),
      ...event
    };

    this._writeQueue = this._writeQueue
      .then(() => this._append(entry))
      .catch((err) => {
        console.error('Activity write error:', err.message);
      });

    return this._writeQueue;
  }

  async _append(entry) {
    await this._ensureDir();
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.filePath, line, 'utf8');
    await this._rotateIfNeeded();
  }

  async _rotateIfNeeded() {
    try {
      const stat = await fs.stat(this.filePath);
      if (stat.size > this.maxFileBytes) {
        // Move current to archive (overwriting previous archive)
        await fs.rename(this.filePath, this.archivePath);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  /**
   * Query recent activity events.
   * @param {Object} options
   * @param {number} [options.limit=50] - Max events to return
   * @param {string} [options.type] - Filter by event type
   * @param {string} [options.since] - ISO date string, only return events after this time
   * @returns {Promise<Object[]>} Events in reverse chronological order
   */
  async query({ limit = 50, type, since } = {}) {
    const clampedLimit = Math.min(Math.max(1, limit), MAX_QUERY_RESULTS);
    const lines = await this._readLines();

    let events = lines
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);

    if (type) {
      events = events.filter((e) => e.type === type);
    }

    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        events = events.filter((e) => new Date(e.ts) >= sinceDate);
      }
    }

    // Return newest first, limited
    return events.reverse().slice(0, clampedLimit);
  }

  async _readLines() {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      return content.split('\n').filter(Boolean);
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  /**
   * Get summary statistics of recorded activity.
   */
  async stats() {
    const events = await this.query({ limit: MAX_QUERY_RESULTS });
    const typeCounts = {};
    for (const event of events) {
      const t = event.type || 'unknown';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    return {
      totalEvents: events.length,
      types: typeCounts,
      oldestEvent: events.length > 0 ? events[events.length - 1].ts : null,
      newestEvent: events.length > 0 ? events[0].ts : null
    };
  }
}

// Singleton instance
const activityService = new ActivityService();
export default activityService;
export { ActivityService };
