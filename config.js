// Configuration for Athena Web
import { homedir } from 'node:os';
import { join } from 'node:path';
import dotenv from 'dotenv';

// Load .env file if it exists
dotenv.config();

const config = {
  // Workspace path: default to ~/.openclaw/workspace
  workspacePath: process.env.WORKSPACE_PATH ||
    join(homedir(), '.openclaw', 'workspace'),

  // State path: ${workspacePath}/state
  get statePath() {
    return join(this.workspacePath, 'state');
  },

  // Beads CLI command
  beadsCli: process.env.BEADS_CLI || 'br',

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
