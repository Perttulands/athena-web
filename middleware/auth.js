/**
 * Authentication middleware.
 * Optional token-based auth controlled by ATHENA_AUTH_TOKEN env var.
 * When set, all /api/* requests must include a valid Bearer token
 * or X-Auth-Token header. Disabled when env var is empty/unset.
 */

import { timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';

const AUTH_TOKEN = process.env.ATHENA_AUTH_TOKEN || '';

/**
 * Check if authentication is enabled.
 */
export function isAuthEnabled() {
  return AUTH_TOKEN.length > 0;
}

/**
 * Extract token from request headers.
 * Supports: Authorization: Bearer <token> or X-Auth-Token: <token>
 */
export function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return req.headers['x-auth-token'] || '';
}

// Paths that bypass authentication (health probes, SSE stream)
const AUTH_BYPASS_PATHS = new Set([
  '/api/health',
  '/health',
  '/api/stream'
]);

/**
 * Authentication middleware.
 * Skips auth for health checks, SSE stream, and when ATHENA_AUTH_TOKEN is not set.
 */
export function authMiddleware(req, res, next) {
  // Skip auth entirely if no token configured
  if (!isAuthEnabled()) {
    return next();
  }

  // Always allow bypassed paths without auth
  if (AUTH_BYPASS_PATHS.has(req.path)) {
    return next();
  }

  // Only protect API routes
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
      status: 401
    });
  }

  // Constant-time comparison to prevent timing attacks
  if (!safeCompare(token, AUTH_TOKEN)) {
    return res.status(403).json({
      error: 'Invalid token',
      status: 403
    });
  }

  next();
}

/**
 * Constant-time string comparison using Node crypto.
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) return false;

  return cryptoTimingSafeEqual(bufA, bufB);
}
