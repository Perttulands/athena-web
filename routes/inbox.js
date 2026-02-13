import express from 'express';
import multer from 'multer';
import {
  saveText,
  saveFile,
  listInbox,
  MAX_UPLOAD_BYTES
} from '../services/inbox-service.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = express.Router();

// Configure multer for memory storage (files stored in buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES
  }
});

function uploadSingle(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File too large (max 10MB)' });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
  });
}

/**
 * GET /api/inbox - List all inbox items
 */
router.get('/', asyncHandler(async (req, res) => {
  const items = await listInbox();
  res.json({ items });
}));

/**
 * POST /api/inbox/text - Save text content to inbox
 */
router.post('/text', asyncHandler(async (req, res) => {
  const { content } = req.body;

  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: 'Missing or invalid content field' });
    return;
  }

  const result = await saveText(content);
  res.json({ saved: true, ...result });
}));

/**
 * POST /api/inbox/upload - Upload a file to inbox
 */
router.post('/upload', uploadSingle, asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    const result = await saveFile(req.file);
    res.json({ saved: true, ...result });
  } catch (error) {
    if (error.code === 'EUPLOAD_VALIDATION') {
      res.status(error.status || 400).json({ error: error.message });
      return;
    }
    throw error;
  }
}));

export default router;
