// Athena Web - Express Server
import express from 'express';
import cors from 'cors';
import config from './config.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server only if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(config.port, () => {
    console.log(`🦉 Athena Web listening on port ${config.port}`);
    console.log(`📂 Workspace: ${config.workspacePath}`);
    console.log(`📊 State: ${config.statePath}`);
    console.log(`🔧 Beads CLI: ${config.beadsCli}`);
  });
}

export default app;
