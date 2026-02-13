import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import config from '../config.js';

const execFileAsync = promisify(execFile);
const TMUX_SOCKET = config.tmuxSocket;

/**
 * Format seconds into human-readable duration (e.g., "12m", "2h 5m")
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Execute tmux command with the configured socket
 * @param {string[]} args - Array of tmux command arguments
 */
async function tmuxExec(args) {
  try {
    const { stdout, stderr } = await execFileAsync(config.tmuxCli, ['-S', TMUX_SOCKET, ...args]);
    return { stdout: stdout.trim(), stderr: stderr.trim(), error: null };
  } catch (error) {
    return { stdout: '', stderr: error.message, error };
  }
}

/**
 * List all agent sessions (sessions prefixed with 'agent-')
 * Returns array of agent objects with status, running time, and last output
 */
export async function listAgents() {
  // Get list of sessions
  const { stdout, error } = await tmuxExec(['list-sessions', '-F', '#{session_name}\t#{session_created}']);

  if (error || !stdout) {
    return [];
  }

  const lines = stdout.split('\n').filter(line => line.trim());
  const agents = [];
  const now = Math.floor(Date.now() / 1000);

  for (const line of lines) {
    const [name, createdTimestamp] = line.split('\t');

    // Only include sessions starting with 'agent-'
    if (!name.startsWith('agent-')) {
      continue;
    }

    const startedAt = parseInt(createdTimestamp, 10);
    const runningSeconds = now - startedAt;
    const runningTime = formatDuration(runningSeconds);

    // Capture last 50 lines of output
    const { stdout: output } = await tmuxExec(['capture-pane', '-t', name, '-p', '-S', '-50']);

    // Extract bead ID from session name (e.g., agent-bd-279 -> bd-279)
    const bead = name.replace('agent-', '');

    // Parse context percentage from output if available (looking for patterns like "67% context")
    let contextPercent = null;
    const contextMatch = output.match(/(\d+)%\s*context/i);
    if (contextMatch) {
      contextPercent = parseInt(contextMatch[1], 10);
    }

    agents.push({
      name,
      bead,
      status: 'running',
      startedAt: new Date(startedAt * 1000).toISOString(),
      runningTime,
      lastOutput: output.split('\n').slice(-3).join('\n').trim(),
      contextPercent
    });
  }

  return agents;
}

/**
 * Get full output for a specific agent session
 * @param {string} name - Session name
 * @param {number} lines - Number of lines to capture (default 200)
 */
export async function getOutput(name, lines = 200) {
  const safeLines = Number.isFinite(Number(lines)) ? Math.max(1, Number(lines)) : 200;
  const { stdout, error } = await tmuxExec(['capture-pane', '-t', name, '-p', '-S', `-${safeLines}`]);

  if (error) {
    return {
      error: true,
      message: `Session ${name} not found`
    };
  }

  return {
    name,
    output: stdout,
    lines: safeLines
  };
}

/**
 * Kill a tmux session
 * @param {string} name - Session name to kill
 */
export async function killAgent(name) {
  const { error } = await tmuxExec(['kill-session', '-t', name]);

  if (error) {
    return {
      error: true,
      message: `Session ${name} not found`
    };
  }

  return {
    killed: true,
    name
  };
}
