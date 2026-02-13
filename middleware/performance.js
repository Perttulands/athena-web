/**
 * Performance monitoring and optimization middleware
 */

/**
 * Response time header middleware
 * Adds X-Response-Time header to all responses
 */
export const responseTime = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1e6; // Convert to milliseconds
    res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);
  });

  next();
};

/**
 * Compression recommendation middleware
 * Nginx handles compression in production, but this can be used for dev
 */
export const compressionHeaders = (req, res, next) => {
  // Set Vary header for better caching with compression
  res.setHeader('Vary', 'Accept-Encoding');
  next();
};

/**
 * ETag generation for API responses
 * Helps with caching and conditional requests
 */
export const apiETag = (req, res, next) => {
  // Only for GET requests
  if (req.method !== 'GET') {
    return next();
  }

  const originalJson = res.json.bind(res);

  res.json = function(data) {
    // Generate simple hash from stringified data
    const hash = simpleHash(JSON.stringify(data));
    const etag = `"${hash}"`;

    // Check if client has cached version
    const clientETag = req.headers['if-none-match'];
    if (clientETag === etag) {
      res.status(304).end();
      return;
    }

    // Set ETag header
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, must-revalidate');

    return originalJson(data);
  };

  next();
};

/**
 * Simple hash function for ETag generation
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Request timeout middleware
 * Prevents long-running requests from blocking
 */
export const requestTimeout = (timeout = 30000) => {
  return (req, res, next) => {
    // Skip for SSE endpoints
    if (req.path.includes('/stream') || req.path.includes('/events')) {
      return next();
    }

    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          error: 'Request timeout',
          status: 408
        });
      }
    }, timeout);

    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
};

/**
 * Memory usage monitoring (development only)
 */
export const memoryMonitor = (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return next();
  }

  const before = process.memoryUsage();

  res.on('finish', () => {
    const after = process.memoryUsage();
    const delta = {
      rss: ((after.rss - before.rss) / 1024 / 1024).toFixed(2),
      heapUsed: ((after.heapUsed - before.heapUsed) / 1024 / 1024).toFixed(2)
    };

    if (Math.abs(delta.heapUsed) > 10) {
      console.log(`⚠️  Memory spike: ${req.method} ${req.path} - Heap: ${delta.heapUsed}MB`);
    }
  });

  next();
};
