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
  const isProduction = process.env.NODE_ENV === 'production';

  // Log the error for debugging
  if (!isProduction) {
    console.error('Error:', err);
  } else {
    // In production, log less detail
    console.error('Error:', err.message);
  }

  const status = err.status || err.statusCode || 500;

  // In production, hide internal error details
  const message = isProduction && status === 500
    ? 'Internal server error'
    : (err.message || 'Internal server error');

  const response = {
    error: message,
    status
  };

  // Include stack trace in development only
  if (!isProduction && err.stack) {
    response.stack = err.stack;
  }

  res.status(status).json(response);
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
