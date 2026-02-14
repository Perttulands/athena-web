import express from 'express';
import config from '../config.js';
import { ArtifactService } from '../services/artifact-service.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = express.Router();
const artifactService = new ArtifactService({
  workspaceRoot: config.workspacePath,
  repoRoots: [config.workspacePath]
});

function getSingleQueryParam(req, key, fallback = '') {
  const value = req.query[key];
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }
  return value ?? fallback;
}

function sendArtifactError(res, error) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  if (typeof error.status === 'number' && typeof error.code === 'string' && error.code.startsWith('EARTIFACT_')) {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
      status: error.status
    });
    return true;
  }

  return false;
}

router.get('/roots', asyncHandler(async (req, res) => {
  const roots = artifactService.listRoots();
  res.json({ roots });
}));

router.get('/tree', asyncHandler(async (req, res) => {
  const root = getSingleQueryParam(req, 'root', '');
  const relativePath = getSingleQueryParam(req, 'path', '');

  if (!root) {
    res.status(400).json({
      error: 'Query parameter "root" is required',
      status: 400
    });
    return;
  }

  try {
    const tree = await artifactService.getTree(root, relativePath);
    res.json({
      root,
      path: relativePath,
      tree
    });
  } catch (error) {
    if (sendArtifactError(res, error)) {
      return;
    }
    throw error;
  }
}));

router.get('/doc', asyncHandler(async (req, res) => {
  const root = getSingleQueryParam(req, 'root', '');
  const relativePath = getSingleQueryParam(req, 'path', '');

  if (!root) {
    res.status(400).json({
      error: 'Query parameter "root" is required',
      status: 400
    });
    return;
  }

  if (!relativePath) {
    res.status(400).json({
      error: 'Query parameter "path" is required',
      status: 400
    });
    return;
  }

  try {
    const { content, metadata } = await artifactService.readDocWithMetadata(root, relativePath);
    res.json({
      root,
      path: relativePath,
      content,
      metadata
    });
  } catch (error) {
    if (sendArtifactError(res, error)) {
      return;
    }
    throw error;
  }
}));

export default router;
