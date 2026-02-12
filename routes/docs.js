import express from 'express';
import { getTree, readDoc, writeDoc } from '../services/docs-service.js';
import config from '../config.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = express.Router();

/**
 * GET /api/docs - Return file tree of workspace docs
 */
router.get('/', asyncHandler(async (req, res) => {
  const tree = await getTree(config.workspacePath);
  res.json({ tree });
}));

/**
 * Middleware to handle document paths for GET and PUT
 * Matches any path that starts with /api/docs/ followed by filename(s)
 */
router.use(asyncHandler(async (req, res, next) => {
  // Only handle GET and PUT requests
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return next();
  }

  // Skip if this is the root path (already handled above)
  if (req.path === '/') {
    return next();
  }

  // req.path gives us the path relative to this router
  // Remove the leading slash
  const relativePath = req.path.startsWith('/') ? req.path.slice(1) : req.path;

  if (req.method === 'GET') {
    // Read document
    try {
      const content = await readDoc(config.workspacePath, relativePath);
      res.json({
        path: relativePath,
        content
      });
    } catch (error) {
      if (error.message.includes('outside workspace')) {
        res.status(400).json({
          error: 'Invalid path: path traversal not allowed',
          status: 400
        });
        return;
      }
      if (error.code === 'ENOENT') {
        res.status(404).json({
          error: `File not found: ${relativePath}`,
          status: 404
        });
        return;
      }
      throw error;
    }
  } else if (req.method === 'PUT') {
    // Write document
    const { content } = req.body;

    if (content === undefined) {
      res.status(400).json({
        error: 'Missing required field: content',
        status: 400
      });
      return;
    }

    try {
      await writeDoc(config.workspacePath, relativePath, content);
      res.json({
        saved: true,
        path: relativePath
      });
    } catch (error) {
      if (error.message.includes('outside workspace')) {
        res.status(400).json({
          error: 'Invalid path: path traversal not allowed',
          status: 400
        });
        return;
      }
      throw error;
    }
  }
}));

export default router;
