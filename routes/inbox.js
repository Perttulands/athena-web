import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config.js';
import {
  InboxService,
  validateUploadFile
} from '../services/inbox-service.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = express.Router();
const inboxService = new InboxService({
  inboxPath: config.inboxPath,
  maxFileBytes: config.maxUploadBytes,
  maxTextBytes: config.maxTextBytes
});

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_SUBMISSIONS = 10;
const submissionRateByIp = new Map();

// Configure multer for memory storage (files stored in buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadBytes
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

  if (recentAttempts.length > 0) {
    submissionRateByIp.set(key, recentAttempts);
  } else {
    submissionRateByIp.delete(key);
  }

  // Periodically prune stale IPs to prevent unbounded Map growth
  if (submissionRateByIp.size > 100) {
    for (const [ip, timestamps] of submissionRateByIp) {
      const fresh = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (fresh.length === 0) {
        submissionRateByIp.delete(ip);
      }
    }
  }

  next();
}

function normalizeInboxItem(item) {
  return {
    name: item.metadata?.original_filename || item.filename || 'Untitled',
    filename: item.filename,
    size: item.size_bytes || item.metadata?.size_bytes || 0,
    created: item.metadata?.created_at || item.mtime || new Date().toISOString(),
    status: item.status || 'incoming',
    metadata: item.metadata || null
  };
}

function normalizeMessageDate(value, fallbackIso) {
  if (typeof value !== 'string' || value.trim() === '') {
    return fallbackIso;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return fallbackIso;
  }

  return new Date(parsed).toISOString();
}

function normalizeMessageEntry(entry, index = 0) {
  const fallbackIso = new Date(0).toISOString();
  const createdAt = normalizeMessageDate(
    entry?.createdAt
      || entry?.created_at
      || entry?.timestamp
      || entry?.time
      || entry?.ts,
    fallbackIso
  );

  return {
    id: String(entry?.id || entry?.message_id || `msg-${index + 1}`),
    title: String(entry?.title || entry?.subject || entry?.type || 'Notification'),
    body: String(entry?.body || entry?.message || entry?.text || ''),
    from: String(entry?.from || entry?.agent || entry?.sender || 'agent'),
    level: String(entry?.level || entry?.severity || entry?.importance || 'normal').toLowerCase(),
    read: Boolean(entry?.read),
    createdAt,
    type: String(entry?.type || 'message')
  };
}

function extractMessages(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  if (Array.isArray(payload.messages)) {
    return payload.messages;
  }

  if (Array.isArray(payload.notifications)) {
    return payload.notifications;
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }

  return [];
}

function getMessageStoreCandidates() {
  const candidates = [
    process.env.MESSAGES_PATH,
    path.join(config.statePath, 'messages.json'),
    path.join(config.workspacePath, 'messages.json'),
    path.join(config.inboxPath, 'messages.json')
  ].filter(Boolean);

  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

async function readMessageStore() {
  const candidates = getMessageStoreCandidates();

  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate);
      if (!stats.isFile()) {
        continue;
      }

      const raw = await fs.readFile(candidate, 'utf8');
      const payload = JSON.parse(raw);
      const messages = extractMessages(payload)
        .map((entry, index) => normalizeMessageEntry(entry, index))
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

      return {
        source: candidate,
        messages
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        continue;
      }

      if (error instanceof SyntaxError) {
        const invalid = new Error(`Invalid JSON in message store: ${candidate}`);
        invalid.status = 500;
        throw invalid;
      }

      throw error;
    }
  }

  return {
    source: null,
    messages: []
  };
}

/**
 * GET /api/inbox - List all inbox items
 */
router.get('/', asyncHandler(async (req, res) => {
  const items = await inboxService.list('incoming');
  res.json({ items: items.map(normalizeInboxItem) });
}));

/**
 * GET /api/inbox/list - List inbox items by status
 */
router.get('/list', asyncHandler(async (req, res) => {
  try {
    const status = req.query.status || 'incoming';
    const items = await inboxService.list(status);
    res.json({ items: items.map(normalizeInboxItem) });
  } catch (error) {
    if (error.code === 'EINBOX_INVALID_STATUS') {
      res.status(error.status || 400).json({ error: error.message });
      return;
    }
    throw error;
  }
}));

/**
 * GET /api/inbox/messages - List agent messages/notifications
 */
router.get('/messages', asyncHandler(async (req, res) => {
  const payload = await readMessageStore();
  const source = payload.source
    ? path.relative(config.workspacePath, payload.source).replace(/\\/g, '/')
    : null;

  res.json({
    source,
    messages: payload.messages
  });
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
