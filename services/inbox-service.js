// Inbox Service - Handle file uploads and text snippets
import { promises as fs } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { homedir } from 'node:os';

const workspacePath = process.env.WORKSPACE_PATH || join(homedir(), '.openclaw', 'workspace');
const inboxPath = join(workspacePath, 'inbox');
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.log',
  '.yaml',
  '.yml',
  '.xml',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.zip',
  '.gz',
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.css',
  '.html',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.sh',
  '.sql'
]);

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/xml',
  'text/xml',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip'
]);

function createUploadError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.code = 'EUPLOAD_VALIDATION';
  return error;
}

function sanitizeFilename(originalName) {
  const normalized = basename(originalName || 'upload.bin')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const fallbackName = normalized || 'upload.bin';
  const maxLength = 120;
  if (fallbackName.length <= maxLength) {
    return fallbackName;
  }

  const extension = extname(fallbackName);
  const extensionSliceLength = Math.min(extension.length, 20);
  const safeExtension = extension.slice(0, extensionSliceLength);
  const stemMaxLength = Math.max(1, maxLength - safeExtension.length);
  return `${fallbackName.slice(0, stemMaxLength)}${safeExtension}`;
}

export function validateUploadFile(file) {
  if (!file || !file.buffer) {
    throw createUploadError(400, 'No file uploaded');
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw createUploadError(400, 'Uploaded file is empty');
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw createUploadError(413, 'File too large (max 10MB)');
  }

  const extension = extname(file.originalname || '').toLowerCase();
  const mimetype = String(file.mimetype || '').toLowerCase();
  const extensionAllowed = ALLOWED_UPLOAD_EXTENSIONS.has(extension);
  const mimetypeAllowed = ALLOWED_UPLOAD_MIME_TYPES.has(mimetype);

  if (!extensionAllowed && !mimetypeAllowed) {
    throw createUploadError(415, 'Unsupported file type');
  }

  return {
    ...file,
    originalname: sanitizeFilename(file.originalname),
    mimetype: mimetype || 'application/octet-stream'
  };
}

/**
 * Ensure the inbox directory exists.
 */
export async function ensureInboxExists() {
  try {
    await fs.mkdir(inboxPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Save text content to the inbox with a timestamp filename.
 */
export async function saveText(content) {
  await ensureInboxExists();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `text-${timestamp}.txt`;
  const filePath = join(inboxPath, filename);

  await fs.writeFile(filePath, content, 'utf-8');

  return {
    filename,
    size: Buffer.byteLength(content, 'utf-8')
  };
}

/**
 * Save an uploaded file to the inbox.
 */
export async function saveFile(file) {
  await ensureInboxExists();
  const validatedFile = validateUploadFile(file);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}-${validatedFile.originalname}`;
  const filePath = join(inboxPath, filename);

  await fs.writeFile(filePath, validatedFile.buffer);

  return {
    filename,
    size: validatedFile.size,
    originalName: validatedFile.originalname,
    mimetype: validatedFile.mimetype
  };
}

/**
 * List all items in the inbox.
 */
export async function listInbox() {
  try {
    await ensureInboxExists();

    const entries = await fs.readdir(inboxPath, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        const fullPath = join(inboxPath, entry.name);
        const stats = await fs.stat(fullPath);

        items.push({
          name: entry.name,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        });
      }
    }

    // Sort by creation time, newest first
    items.sort((a, b) => b.created - a.created);

    return items;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
