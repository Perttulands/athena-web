/**
 * Health dashboard service.
 * Aggregates system health metrics: process memory, uptime,
 * service statuses, and cache stats.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import cache from './cache-service.js';

const execFileAsync = promisify(execFile);

const startTime = Date.now();

/**
 * Get process-level health metrics.
 */
function getProcessHealth() {
  const mem = process.memoryUsage();
  const uptimeMs = Date.now() - startTime;

  return {
    pid: process.pid,
    uptimeMs,
    uptimeFormatted: formatUptime(uptimeMs),
    nodeVersion: process.version,
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
      unit: 'MB'
    }
  };
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Check external service reachability.
 */
async function checkService(name, checkFn) {
  const start = Date.now();
  try {
    await checkFn();
    return {
      name,
      status: 'ok',
      latencyMs: Date.now() - start
    };
  } catch (error) {
    return {
      name,
      status: 'error',
      latencyMs: Date.now() - start,
      error: error.message
    };
  }
}

/**
 * Get full health dashboard data.
 */
export async function getHealthDashboard() {
  const processHealth = getProcessHealth();

  // Check external dependencies in parallel
  const [beadsCli, tmux] = await Promise.allSettled([
    checkService('beads-cli', async () => {
      await execFileAsync('br', ['--version'], { timeout: 3000 });
    }),
    checkService('tmux', async () => {
      await execFileAsync('tmux', ['-V'], { timeout: 3000 });
    })
  ]);

  const services = [
    beadsCli.status === 'fulfilled' ? beadsCli.value : { name: 'beads-cli', status: 'error', error: 'check failed' },
    tmux.status === 'fulfilled' ? tmux.value : { name: 'tmux', status: 'error', error: 'check failed' }
  ];

  const allOk = services.every((s) => s.status === 'ok');

  return {
    timestamp: new Date().toISOString(),
    overall: allOk ? 'healthy' : 'degraded',
    process: processHealth,
    services,
    cache: cache.stats()
  };
}

export { getProcessHealth, formatUptime };
