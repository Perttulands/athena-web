import EventEmitter from 'node:events';
import { watch } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config.js';
import { listAgents } from './tmux-service.js';
import { listBeads } from './beads-service.js';
import runsService from './runs-service.js';
import ralphService from './ralph-service.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * SSE Service - Singleton event emitter for server-sent events
 * Manages client connections and broadcasts real-time updates
 */
class SSEService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.clients = new Set();
    this.heartbeatInterval = null;
    this.agentPollInterval = null;
    this.watchers = [];
    this.monitoring = false;

    this.watchFn = options.watchFn || watch;
    this.listAgentsFn = options.listAgentsFn || listAgents;
    this.listBeadsFn = options.listBeadsFn || listBeads;
    this.listRunsFn = options.listRunsFn || runsService.listRuns;
    this.getRalphStatusFn = options.getRalphStatusFn || ralphService.getRalphStatus;

    this.statePath = options.statePath || config.statePath;
    this.workspacePath = options.workspacePath || config.workspacePath;
    this.agentPollIntervalMs = options.agentPollIntervalMs || 10000;

    this.prdPath = options.prdPath || join(projectRoot, 'PRD_ATHENA_WEB.md');
    this.progressPath = options.progressPath || join(projectRoot, 'progress_athena_web.txt');

    this.lastAgentsSnapshot = null;
    this.lastRunSignature = null;
  }

  /**
   * Add a client connection
   * @param {Response} res - Express response object
   */
  addClient(res) {
    this.clients.add(res);

    // Remove client when connection closes
    res.once('close', () => {
      this.removeClient(res);
    });

    console.log(`SSE client connected. Total clients: ${this.clients.size}`);
  }

  /**
   * Remove a client connection
   * @param {Response} res - Express response object
   */
  removeClient(res) {
    this.clients.delete(res);
    console.log(`SSE client disconnected. Total clients: ${this.clients.size}`);
  }

  /**
   * Broadcast an event to all connected clients
   * @param {string} type - Event type
   * @param {Object} data - Event data
   */
  broadcast(type, data) {
    const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

    // Snapshot clients before iterating — removeClient mutates the Set
    const snapshot = [...this.clients];
    for (const client of snapshot) {
      try {
        client.write(message);
      } catch (error) {
        console.error('Failed to write to SSE client:', error.message);
        this.removeClient(client);
      }
    }
  }

  /**
   * Send heartbeat to all clients
   * SSE comment format - keeps connection alive
   */
  sendHeartbeat() {
    const heartbeat = ':heartbeat\n\n';

    const snapshot = [...this.clients];
    for (const client of snapshot) {
      try {
        client.write(heartbeat);
      } catch (error) {
        console.error('Failed to send heartbeat:', error.message);
        this.removeClient(client);
      }
    }
  }

  /**
   * Start heartbeat interval (30s)
   */
  startHeartbeat() {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000); // 30 seconds

    console.log('SSE heartbeat started (30s interval)');
  }

  /**
   * Stop heartbeat interval
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('SSE heartbeat stopped');
    }
  }

  async pollAgentStatus() {
    try {
      const agents = await this.listAgentsFn();
      const snapshot = JSON.stringify(agents.map(agent => ({
        name: agent.name,
        status: agent.status,
        bead: agent.bead,
        runningTime: agent.runningTime,
        contextPercent: agent.contextPercent
      })));

      if (snapshot === this.lastAgentsSnapshot) {
        return;
      }

      this.lastAgentsSnapshot = snapshot;

      this.broadcast('agent_status', {
        timestamp: new Date().toISOString(),
        agents,
        running: agents.filter(agent => agent.status === 'running').length,
        total: agents.length
      });
    } catch (error) {
      console.warn('SSE agent polling failed:', error.message);
    }
  }

  async broadcastBeadUpdate(metadata = {}) {
    try {
      const beads = await this.listBeadsFn();
      const payload = {
        timestamp: new Date().toISOString(),
        todo: beads.filter(bead => bead.status === 'todo').length,
        active: beads.filter(bead => bead.status === 'active').length,
        done: beads.filter(bead => bead.status === 'done').length,
        failed: beads.filter(bead => bead.status === 'failed').length,
        ...metadata
      };

      this.broadcast('bead_update', payload);
    } catch (error) {
      console.warn('SSE bead update failed:', error.message);
    }
  }

  async broadcastLatestActivity(metadata = {}) {
    try {
      const runs = await this.listRunsFn();
      if (!Array.isArray(runs) || runs.length === 0) return;

      const latest = runs[0];
      const signature = `${latest.bead}|${latest.started_at}|${latest.exit_code}`;
      if (signature === this.lastRunSignature) return;
      this.lastRunSignature = signature;

      const success = latest.exit_code === 0;
      this.broadcast('activity', {
        timestamp: new Date().toISOString(),
        time: latest.started_at || new Date().toISOString(),
        type: success ? 'agent_complete' : 'agent_failed',
        message: `Agent ${latest.bead || latest.agent || 'unknown'} ${success ? 'completed' : 'failed'}`,
        ...metadata
      });
    } catch (error) {
      console.warn('SSE activity update failed:', error.message);
    }
  }

  async broadcastRalphProgress(metadata = {}) {
    try {
      const ralph = await this.getRalphStatusFn(this.prdPath, this.progressPath);
      this.broadcast('ralph_progress', {
        timestamp: new Date().toISOString(),
        currentTask: ralph.activeTask,
        currentIteration: ralph.currentIteration,
        maxIterations: ralph.maxIterations,
        prdProgress: ralph.prdProgress,
        tasks: Array.isArray(ralph.tasks) ? ralph.tasks : [],
        ...metadata
      });
    } catch (error) {
      console.warn('SSE Ralph update failed:', error.message);
    }
  }

  onStateChange(source, eventType, filename) {
    const metadata = {
      source,
      eventType,
      file: filename || null
    };

    void this.broadcastBeadUpdate(metadata);
    void this.broadcastLatestActivity(metadata);
    void this.broadcastRalphProgress(metadata);
  }

  addDirectoryWatcher(source, directoryPath) {
    try {
      const watcher = this.watchFn(directoryPath, (eventType, filename) => {
        this.onStateChange(source, eventType, filename);
      });
      this.watchers.push(watcher);
    } catch (error) {
      // Missing directory is normal in bootstrapped environments.
      if (error.code !== 'ENOENT') {
        console.warn(`SSE failed to watch ${directoryPath}:`, error.message);
      }
    }
  }

  startMonitoring() {
    if (this.monitoring) return;
    this.monitoring = true;

    this.addDirectoryWatcher('runs', join(this.statePath, 'runs'));
    this.addDirectoryWatcher('results', join(this.statePath, 'results'));

    void this.pollAgentStatus();
    this.agentPollInterval = setInterval(() => {
      void this.pollAgentStatus();
    }, this.agentPollIntervalMs);
  }

  stopMonitoring() {
    this.monitoring = false;

    if (this.agentPollInterval) {
      clearInterval(this.agentPollInterval);
      this.agentPollInterval = null;
    }

    this.watchers.forEach((watcher) => {
      try {
        watcher.close();
      } catch {
        // no-op
      }
    });
    this.watchers = [];
  }

  /**
   * Cleanup - for testing
   */
  cleanup() {
    this.stopMonitoring();
    this.stopHeartbeat();
    this.clients.forEach((client) => {
      try {
        client.end?.();
      } catch {
        // no-op
      }
    });
    this.clients.clear();
    this.lastAgentsSnapshot = null;
    this.lastRunSignature = null;
  }
}

// Export singleton instance
export default SSEService;
