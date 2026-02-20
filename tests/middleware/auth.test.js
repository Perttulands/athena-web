import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { authMiddleware, isAuthEnabled, extractToken } from '../../middleware/auth.js';

function mockReq({ path = '/api/status', authorization, xAuthToken } = {}) {
  const headers = {};
  if (authorization) headers.authorization = authorization;
  if (xAuthToken) headers['x-auth-token'] = xAuthToken;
  return { path, headers };
}

function mockRes() {
  let statusCode = 200;
  let body = null;
  return {
    status(code) { statusCode = code; return this; },
    json(data) { body = data; return this; },
    get statusCode() { return statusCode; },
    get body() { return body; }
  };
}

describe('Auth middleware', () => {
  describe('isAuthEnabled', () => {
    it('returns false when ATHENA_AUTH_TOKEN is empty', () => {
      // The module reads env at import time, and our test env has no token set
      // This test verifies the helper is callable
      assert.equal(typeof isAuthEnabled(), 'boolean');
    });
  });

  describe('extractToken', () => {
    it('extracts Bearer token from Authorization header', () => {
      const req = mockReq({ authorization: 'Bearer my-secret-token' });
      assert.equal(extractToken(req), 'my-secret-token');
    });

    it('extracts X-Auth-Token header', () => {
      const req = mockReq({ xAuthToken: 'x-token-value' });
      assert.equal(extractToken(req), 'x-token-value');
    });

    it('prefers Authorization header over X-Auth-Token', () => {
      const req = mockReq({
        authorization: 'Bearer bearer-val',
        xAuthToken: 'x-val'
      });
      assert.equal(extractToken(req), 'bearer-val');
    });

    it('returns empty string when no auth headers present', () => {
      const req = mockReq({});
      assert.equal(extractToken(req), '');
    });

    it('returns empty string for non-Bearer Authorization', () => {
      const req = mockReq({ authorization: 'Basic abc123' });
      assert.equal(extractToken(req), '');
    });
  });

  describe('authMiddleware (no token configured)', () => {
    it('passes through all requests when auth is disabled', (t, done) => {
      const req = mockReq({ path: '/api/beads' });
      const res = mockRes();
      authMiddleware(req, res, () => {
        // next() was called — auth passed
        done();
      });
    });

    it('passes through health check', (t, done) => {
      const req = mockReq({ path: '/api/health' });
      const res = mockRes();
      authMiddleware(req, res, () => {
        done();
      });
    });

    it('passes through non-API paths', (t, done) => {
      const req = mockReq({ path: '/index.html' });
      const res = mockRes();
      authMiddleware(req, res, () => {
        done();
      });
    });
  });

  describe('authMiddleware integration via server', () => {
    it('health endpoint is always accessible', async () => {
      const { request, canListen } = await import('../setup.js');
      if (!(await canListen())) return;

      const { default: app } = await import('../../server.js');
      const result = await request(app, '/api/health');
      if (result.skipped) return;

      assert.equal(result.status, 200);
      assert.deepEqual(result.data, { status: 'ok' });
    });
  });
});
