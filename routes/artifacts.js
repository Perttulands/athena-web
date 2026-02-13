import express from 'express';
import { getArtifacts, readArtifact } from '../services/artifacts-service.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = express.Router();
const BASE64URL_PATH_PATTERN = /^[A-Za-z0-9_-]{1,4096}$/;

function decodeArtifactPath(encodedPath) {
  if (typeof encodedPath !== 'string' || !BASE64URL_PATH_PATTERN.test(encodedPath)) {
    return null;
  }

  try {
    const decoded = Buffer.from(encodedPath, 'base64url').toString('utf-8');
    if (!decoded || decoded.includes('\u0000')) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * GET /api/artifacts - List all available artifacts
 */
router.get('/', asyncHandler(async (req, res) => {
  const artifacts = await getArtifacts();
  res.json({ artifacts });
}));

/**
 * GET /api/artifacts/:path - Read a specific artifact by path
 * The path is base64-encoded to safely transmit file paths with special characters
 */
router.get('/:encodedPath', asyncHandler(async (req, res) => {
  const { encodedPath } = req.params;
  const artifactPath = decodeArtifactPath(encodedPath);
  if (!artifactPath) {
    res.status(400).json({ error: 'Invalid path encoding' });
    return;
  }

  try {
    const content = await readArtifact(artifactPath);
    res.json({ path: artifactPath, content });
  } catch (error) {
    if (error.code === 'EARTIFACT_ACCESS') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    if (error.code === 'EARTIFACT_INVALID') {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }
    throw error;
  }
}));

export default router;
