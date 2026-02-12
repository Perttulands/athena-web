/**
 * Async route wrapper to catch promise rejections
 * Eliminates need for try/catch in every async route handler
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 404 handler for undefined API routes
 */
export const notFoundHandler = (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      error: 'Not found',
      status: 404
    });
  } else {
    next();
  }
};

/**
 * Global error handler
 * Returns JSON error response with appropriate status code
 */
export const errorHandler = (err, req, res, next) => {
  // Log the error for debugging (but don't expose details to client)
  console.error('Error:', err.message);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({
    error: message,
    status
  });
};

/**
 * Simple request logger middleware
 * Logs method, path, status, and duration for each request
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Capture the original end function
  const originalEnd = res.end;

  // Override end to log after response is sent
  res.end = function(...args) {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    originalEnd.apply(res, args);
  };

  next();
};
