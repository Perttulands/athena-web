// Athena Web - Express Server
import express from 'express';
import cors from 'cors';
import config from './config.js';
import {
  asyncHandler,
  notFoundHandler,
  errorHandler,
  requestLogger
} from './middleware/error-handler.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Test routes for error handling (only in non-production)
if (process.env.NODE_ENV !== 'production') {
  // Test sync error
  app.get('/api/test-sync-error', (req, res) => {
    throw new Error('Sync error test');
  });

  // Test async error
  app.get('/api/test-async-error', asyncHandler(async (req, res) => {
    throw new Error('Async error test');
  }));

  // Test custom error status
  app.get('/api/test-custom-error', (req, res) => {
    const err = new Error('Custom error test');
    err.status = 400;
    throw err;
  });
}

// 404 handler for unknown API routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

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
