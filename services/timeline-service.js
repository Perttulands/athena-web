/**
 * Timeline service.
 * Transforms run history into timeline events with duration,
 * outcome, and grouping by day.
 */

import runsService from './runs-service.js';
import cache from './cache-service.js';

/**
 * Transform a run record into a timeline event.
 */
function toTimelineEvent(run) {
  const startedAt = run.started_at || null;
  const endedAt = run.ended_at || run.finished_at || null;

  let durationMs = null;
  if (startedAt && endedAt) {
    durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  } else if (startedAt && run.duration_seconds != null) {
    durationMs = run.duration_seconds * 1000;
  }

  const success = run.exit_code === 0;

  return {
    id: run.id || run.bead || null,
    bead: run.bead || null,
    agent: run.agent || null,
    type: success ? 'success' : 'failure',
    startedAt,
    endedAt,
    durationMs,
    durationFormatted: formatDuration(durationMs),
    exitCode: run.exit_code ?? null,
    verification: run.verification || null,
    message: buildMessage(run, success)
  };
}

function formatDuration(ms) {
  if (ms == null) return null;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  if (minutes < 60) return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

function buildMessage(run, success) {
  const agent = run.bead || run.agent || 'unknown';
  let msg = `Agent ${agent} ${success ? 'completed' : 'failed'}`;
  if (run.verification) {
    const lint = run.verification.lint || 'unknown';
    const tests = run.verification.tests || 'unknown';
    msg += ` (lint: ${lint}, tests: ${tests})`;
  }
  return msg;
}

/**
 * Group timeline events by date (YYYY-MM-DD).
 */
function groupByDay(events) {
  const groups = {};
  for (const event of events) {
    const day = event.startedAt
      ? event.startedAt.substring(0, 10)
      : 'unknown';
    if (!groups[day]) groups[day] = [];
    groups[day].push(event);
  }
  return groups;
}

/**
 * Compute per-bead duration breakdown from events.
 */
function beadDurationBreakdown(events) {
  const byBead = {};
  for (const e of events) {
    if (!e.bead || e.durationMs == null) continue;
    if (!byBead[e.bead]) byBead[e.bead] = { totalMs: 0, runs: 0, successes: 0 };
    byBead[e.bead].totalMs += e.durationMs;
    byBead[e.bead].runs++;
    if (e.type === 'success') byBead[e.bead].successes++;
  }
  return Object.entries(byBead).map(([bead, data]) => ({
    bead,
    totalMs: data.totalMs,
    totalFormatted: formatDuration(data.totalMs),
    avgMs: Math.round(data.totalMs / data.runs),
    avgFormatted: formatDuration(Math.round(data.totalMs / data.runs)),
    runs: data.runs,
    successRate: data.runs > 0 ? parseFloat((data.successes / data.runs).toFixed(3)) : 0
  })).sort((a, b) => b.totalMs - a.totalMs);
}

/**
 * Get timeline data. Supports optional filters:
 *   limit, offset, status ('success'|'failure'), bead, agent, since, until
 */
export async function getTimeline(filters = {}) {
  const runs = await cache.getOrFetch('runs', () => runsService.listRuns(), 5000);
  let events = runs.map(toTimelineEvent);

  // Apply filters
  if (filters.status) {
    events = events.filter((e) => e.type === filters.status);
  }
  if (filters.bead) {
    events = events.filter((e) => e.bead === filters.bead);
  }
  if (filters.agent) {
    events = events.filter((e) => e.agent === filters.agent);
  }
  if (filters.since) {
    const sinceMs = new Date(filters.since).getTime();
    if (!Number.isNaN(sinceMs)) {
      events = events.filter((e) => e.startedAt && new Date(e.startedAt).getTime() >= sinceMs);
    }
  }
  if (filters.until) {
    const untilMs = new Date(filters.until).getTime();
    if (!Number.isNaN(untilMs)) {
      events = events.filter((e) => e.startedAt && new Date(e.startedAt).getTime() <= untilMs);
    }
  }

  const offset = Math.max(parseInt(filters.offset, 10) || 0, 0);
  const limit = Math.min(parseInt(filters.limit, 10) || 50, 200);
  const limited = events.slice(offset, offset + limit);

  // Stats
  const successCount = events.filter((e) => e.type === 'success').length;
  const failCount = events.filter((e) => e.type === 'failure').length;
  const durations = events.filter((e) => e.durationMs != null).map((e) => e.durationMs);
  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  return {
    timestamp: new Date().toISOString(),
    total: events.length,
    returned: limited.length,
    offset,
    stats: {
      success: successCount,
      failure: failCount,
      successRate: events.length > 0
        ? parseFloat((successCount / events.length).toFixed(3))
        : 0,
      avgDurationMs: avgDuration,
      avgDurationFormatted: formatDuration(avgDuration)
    },
    beadBreakdown: beadDurationBreakdown(events),
    events: limited,
    byDay: groupByDay(limited)
  };
}

export { toTimelineEvent, formatDuration, beadDurationBreakdown, groupByDay };
