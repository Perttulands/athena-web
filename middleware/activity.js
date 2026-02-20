/**
 * Activity recording middleware.
 * Automatically logs API requests to the activity persistence service.
 */

import activityService from '../services/activity-service.js';

// Paths to skip recording (noisy or internal)
const SKIP_PATHS = new Set([
  '/api/health',
  '/health',
  '/api/stream',
  '/api/status/cache'
]);

/**
 * Middleware that records completed API requests as activity events.
 */
export function activityRecorder(req, res, next) {
  if (!req.path.startsWith('/api/') || SKIP_PATHS.has(req.path)) {
    return next();
  }

  const start = Date.now();

  res.on('finish', () => {
    activityService.record({
      type: 'api_request',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start
    });
  });

  next();
}
