import express from 'express';
import multer from 'multer';
import {
  InboxService,
  MAX_UPLOAD_BYTES,
  validateUploadFile
} from '../services/inbox-service.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = express.Router();
const inboxService = new InboxService({
  inboxPath: process.env.INBOX_PATH,
  maxFileBytes: MAX_UPLOAD_BYTES
});

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_SUBMISSIONS = 10;
const submissionRateByIp = new Map();

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

function enforceSubmissionRateLimit(req, res, next) {
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const attempts = submissionRateByIp.get(key) || [];
  const recentAttempts = attempts.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recentAttempts.length >= RATE_LIMIT_MAX_SUBMISSIONS) {
    res.status(429).json({ error: 'Rate limit exceeded (max 10 submissions per minute)' });
    return;
  }

  recentAttempts.push(now);
  submissionRateByIp.set(key, recentAttempts);
  next();
}

/**
 * GET /api/inbox - List all inbox items
 */
router.get('/', asyncHandler(async (req, res) => {
  const items = await inboxService.list('incoming');
  res.json({ items });
}));

/**
 * GET /api/inbox/list - List inbox items by status
 */
router.get('/list', asyncHandler(async (req, res) => {
  try {
    const status = req.query.status || 'incoming';
    const items = await inboxService.list(status);
    res.json({ items });
  } catch (error) {
    if (error.code === 'EINBOX_INVALID_STATUS') {
      res.status(error.status || 400).json({ error: error.message });
      return;
    }
    throw error;
  }
}));

/**
 * POST /api/inbox/text - Save text content to inbox
 */
router.post('/text', enforceSubmissionRateLimit, asyncHandler(async (req, res) => {
  const { title, format } = req.body || {};
  const text = req.body?.text ?? req.body?.content;

  if (typeof text !== 'string' || text.length === 0) {
    res.status(400).json({ error: 'Missing or invalid text field' });
    return;
  }

  try {
    const result = await inboxService.submitText(title || 'text', text, format || 'txt');
    console.log(`[inbox] text submitted ip=${req.ip} size=${Buffer.byteLength(text, 'utf8')} sha256=${result.metadata?.sha256 || '-'} outcome=ok`);
    res.json({ saved: true, ...result });
  } catch (error) {
    console.log(`[inbox] text submit failed ip=${req.ip} outcome=error code=${error.code || '-'}`);
    if (error.code === 'EINBOX_SIZE_LIMIT' || error.code === 'EINBOX_INVALID_TEXT') {
      res.status(error.status || 400).json({ error: error.message });
      return;
    }
    throw error;
  }
}));

/**
 * POST /api/inbox/upload - Upload a file to inbox
 */
router.post('/upload', enforceSubmissionRateLimit, uploadSingle, asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    const validatedFile = validateUploadFile(req.file);
    const result = await inboxService.submitFile(validatedFile);
    console.log(`[inbox] file uploaded ip=${req.ip} size=${result.metadata?.size_bytes || 0} sha256=${result.metadata?.sha256 || '-'} file=${result.filename} outcome=ok`);
    res.json({ saved: true, ...result });
  } catch (error) {
    console.log(`[inbox] file upload failed ip=${req.ip} outcome=error code=${error.code || '-'}`);
    if (error.code === 'EUPLOAD_VALIDATION' || error.code === 'EINBOX_SIZE_LIMIT') {
      res.status(error.status || 400).json({ error: error.message });
      return;
    }
    throw error;
  }
}));

export default router;
