// Configuration for Athena Web
import { homedir } from 'node:os';
import { join } from 'node:path';
import dotenv from 'dotenv';

// Load .env file if it exists
dotenv.config();

const config = {
  // Workspace path: default to ~/athena
  workspacePath: process.env.WORKSPACE_PATH ||
    join(homedir(), 'athena'),

  // State path: ${workspacePath}/state (can be overridden for testing)
  get statePath() {
    return process.env.STATE_PATH || join(this.workspacePath, 'state');
  },

  // Inbox path: ${workspacePath}/inbox
  get inboxPath() {
    return process.env.INBOX_PATH || join(this.workspacePath, 'inbox');
  },

  // Upload/text size limits
  maxUploadBytes: process.env.MAX_UPLOAD_BYTES
    ? parseInt(process.env.MAX_UPLOAD_BYTES, 10)
    : 10 * 1024 * 1024, // 10MB

  maxTextBytes: process.env.MAX_TEXT_BYTES
    ? parseInt(process.env.MAX_TEXT_BYTES, 10)
    : 2 * 1024 * 1024, // 2MB

  // Artifact roots: repo directories to scan for PRDs
  get artifactRoots() {
    if (process.env.ARTIFACT_ROOTS) {
      return process.env.ARTIFACT_ROOTS.split(',').map((p) => p.trim()).filter(Boolean);
    }
    return [this.workspacePath];
  },

  // Beads CLI command
  beadsCli: process.env.BEADS_CLI || 'br',

  // tmux CLI command and socket path for coding agents
  tmuxCli: process.env.TMUX_CLI || 'tmux',
  tmuxSocket: process.env.TMUX_SOCKET || '/tmp/openclaw-coding-agents.sock',

  // Server port
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 9000,

  // Node environment
  nodeEnv: process.env.NODE_ENV || 'development',

  // Is production
  get isProduction() {
    return this.nodeEnv === 'production';
  }
};

export default config;
