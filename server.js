// Athena Web - Express Server
import express from 'express';
import cors from 'cors';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config.js';
import {
  asyncHandler,
  notFoundHandler,
  errorHandler,
  requestLogger
} from './middleware/error-handler.js';
import {
  responseTime,
  compressionHeaders,
  gzipCompression,
  apiETag,
  requestTimeout,
  memoryMonitor
} from './middleware/performance.js';
import { authMiddleware } from './middleware/auth.js';
import { activityRecorder } from './middleware/activity.js';
import beadsRouter from './routes/beads.js';
import agentsRouter from './routes/agents.js';
import docsRouter from './routes/docs.js';
import runsRouter from './routes/runs.js';
import ralphRouter from './routes/ralph.js';
import statusRouter from './routes/status.js';
import streamRouter, { sseService } from './routes/stream.js';
import artifactsRouter from './routes/artifacts.js';
import inboxRouter from './routes/inbox.js';
import tapestryRouter from './routes/tapestry.js';
import timelineRouter from './routes/timeline.js';
import healthDashRouter from './routes/health-dashboard.js';
import activityRouter from './routes/activity.js';
import { ArtifactWatchService } from './services/artifact-watch-service.js';
import { ArtifactService } from './services/artifact-service.js';

const app = express();
const serverDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(serverDir, 'public');

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  next();
});

// Performance middleware
app.use(responseTime);
app.use(compressionHeaders);
app.use(gzipCompression);
app.use(requestTimeout(30000)); // 30 second timeout

// Development monitoring
if (config.nodeEnv !== 'production') {
  app.use(memoryMonitor);
}

// Authentication (optional, enabled via ATHENA_AUTH_TOKEN env var)
app.use(authMiddleware);

// Core middleware — restrict CORS to same-origin
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin, curl, mobile apps)
    if (!origin) return callback(null, true);
    // In production, only allow same-origin
    if (config.isProduction) return callback(new Error('CORS not allowed'), false);
    // In development, allow localhost origins
    callback(null, true);
  },
  credentials: false
}));
app.use(express.json());
app.use(requestLogger);
app.use(activityRecorder);

// ETag support for API responses
app.use('/api', apiETag);

// Serve static files from public directory
app.use(express.static(publicDir));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Convenience alias used by deployment probes
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API routes
app.use('/api/status', statusRouter);
app.use('/api/beads', beadsRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/docs', docsRouter);
app.use('/api/runs', runsRouter);
app.use('/api/ralph', ralphRouter);
app.use('/api/artifacts', artifactsRouter);
app.use('/api/inbox', inboxRouter);
app.use('/api/tapestry', tapestryRouter);
app.use('/api/timeline', timelineRouter);
app.use('/api/health-dashboard', healthDashRouter);
app.use('/api/activity', activityRouter);
app.use('/api', streamRouter);

// SPA fallback for non-API routes without a file extension.
app.get(/^\/(?!api(?:\/|$)).*/, (req, res, next) => {
  if (req.path.includes('.')) {
    return next();
  }

  res.sendFile(join(publicDir, 'index.html'));
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

// Graceful shutdown handler
function gracefulShutdown(server, watcher) {
  let shuttingDown = false;
  const SHUTDOWN_TIMEOUT_MS = 10000;

  return (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\nReceived ${signal}. Shutting down gracefully...`);

    // Stop accepting new connections
    server.close(() => {
      console.log('HTTP server closed.');
    });

    // Close SSE clients
    sseService.cleanup();

    // Stop artifact watcher
    if (watcher) {
      watcher.stop();
    }

    // Force exit after timeout
    const forceExit = setTimeout(() => {
      console.warn('Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    // Close remaining connections
    server.closeAllConnections?.();

    // Allow event loop to drain
    setTimeout(() => {
      console.log('Shutdown complete.');
      process.exit(0);
    }, 500).unref();
  };
}

// Start server only if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = app.listen(config.port, () => {
    console.log(`🦉 Athena Web listening on port ${config.port}`);
    console.log(`📂 Workspace: ${config.workspacePath}`);
    console.log(`📊 State: ${config.statePath}`);
    console.log(`🔧 Beads CLI: ${config.beadsCli}`);
  });

  // Start artifact/inbox file watcher for real-time SSE updates
  const artifactService = new ArtifactService({
    workspaceRoot: config.workspacePath,
    repoRoots: config.artifactRoots
  });
  const watchRoots = Array.from(artifactService.roots.values())
    .filter((root) => root.type === 'filesystem' && root.path);
  const watcher = new ArtifactWatchService({ sseService });
  watcher.start(watchRoots, config.inboxPath);

  // Register shutdown handlers
  const shutdown = gracefulShutdown(server, watcher);
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default app;
