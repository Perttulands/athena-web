import fs from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import crypto from 'node:crypto';

const INBOX_STATUSES = ['incoming', 'processing', 'done', 'failed'];
const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_TEXT_BYTES = 2 * 1024 * 1024;

const workspacePath = process.env.WORKSPACE_PATH || path.join(homedir(), '.openclaw', 'workspace');
const defaultInboxPath = process.env.INBOX_PATH || path.join(workspacePath, 'inbox');

// Kept for backward compatibility with existing routes/tests.
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

function createInboxError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function sanitizeFilename(input, fallback = 'file') {
  const base = path.basename(input || fallback);
  const normalized = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

function sanitizeTitle(input) {
  const normalized = String(input || 'note')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'note';
}

function computeSha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function normalizeFormat(format) {
  const normalized = String(format || 'txt').toLowerCase();
  if (normalized === 'md' || normalized === 'markdown') {
    return { extension: 'md', contentType: 'text/markdown' };
  }

  return { extension: 'txt', contentType: 'text/plain' };
}

function normalizeStatus(status) {
  if (status === undefined || status === null || status === '') {
    return 'incoming';
  }

  const normalized = String(status).toLowerCase();
  if (!INBOX_STATUSES.includes(normalized)) {
    throw createInboxError('EINBOX_INVALID_STATUS', `Unsupported inbox status: ${status}`, 400);
  }

  return normalized;
}

export class InboxService {
  constructor(options = {}) {
    this.inboxPath = path.resolve(options.inboxPath || defaultInboxPath);
    this.maxFileBytes = Number.isFinite(options.maxFileBytes)
      ? options.maxFileBytes
      : DEFAULT_MAX_FILE_BYTES;
    this.maxTextBytes = Number.isFinite(options.maxTextBytes)
      ? options.maxTextBytes
      : DEFAULT_MAX_TEXT_BYTES;
  }

  async submitFile(file, metadata = {}) {
    const normalizedFile = this.#normalizeFileUpload(file);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const originalFilename = path.basename(normalizedFile.originalname || 'upload.bin');
    const safeFilename = sanitizeFilename(originalFilename, 'upload.bin');
    const filename = `${id}-${safeFilename}`;

    const fileMetadata = {
      id,
      source: 'upload',
      created_at: createdAt,
      original_filename: originalFilename,
      content_type: normalizedFile.mimetype,
      size_bytes: normalizedFile.size,
      sha256: computeSha256(normalizedFile.buffer),
      ...metadata
    };

    await this.#writeIncomingFile(filename, normalizedFile.buffer, fileMetadata);

    return {
      id,
      status: 'incoming',
      filename,
      metadata: fileMetadata
    };
  }

  async submitText(title, text, format = 'txt') {
    if (typeof text !== 'string') {
      throw createInboxError('EINBOX_INVALID_TEXT', 'Text submission must be a string', 400);
    }

    const byteSize = Buffer.byteLength(text, 'utf8');
    if (byteSize > this.maxTextBytes) {
      throw createInboxError('EINBOX_SIZE_LIMIT', `Text exceeds max size of ${this.maxTextBytes} bytes`, 413);
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const { extension, contentType } = normalizeFormat(format);
    const safeTitle = sanitizeTitle(title);
    const originalFilename = `${safeTitle}.${extension}`;
    const filename = `${id}-${originalFilename}`;
    const buffer = Buffer.from(text, 'utf8');

    const metadata = {
      id,
      source: 'text',
      created_at: createdAt,
      original_filename: originalFilename,
      content_type: contentType,
      size_bytes: byteSize,
      sha256: computeSha256(buffer)
    };

    await this.#writeIncomingFile(filename, buffer, metadata);

    return {
      id,
      status: 'incoming',
      filename,
      metadata
    };
  }

  async list(status = 'incoming') {
    const normalizedStatus = normalizeStatus(status);
    await this.ensureDirectories();

    const statusPath = path.join(this.inboxPath, normalizedStatus);
    let entries;
    try {
      entries = await fs.readdir(statusPath, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const files = entries
      .filter((entry) => entry.isFile())
      .filter((entry) => !entry.name.endsWith('.meta.json'))
      .filter((entry) => !entry.name.endsWith('.tmp'));

    const items = await Promise.all(files.map(async (entry) => {
      const filePath = path.join(statusPath, entry.name);
      const metaPath = `${filePath}.meta.json`;
      const stats = await fs.stat(filePath);

      let metadata = null;
      try {
        const sidecar = await fs.readFile(metaPath, 'utf8');
        metadata = JSON.parse(sidecar);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      return {
        status: normalizedStatus,
        filename: entry.name,
        path: filePath,
        metadata,
        size_bytes: stats.size,
        mtime: stats.mtime.toISOString()
      };
    }));

    items.sort((left, right) => {
      const leftTs = Date.parse(left.metadata?.created_at || left.mtime);
      const rightTs = Date.parse(right.metadata?.created_at || right.mtime);
      return rightTs - leftTs;
    });

    return items;
  }

  async ensureDirectories() {
    await fs.mkdir(this.inboxPath, { recursive: true });
    await Promise.all(
      INBOX_STATUSES.map((status) => fs.mkdir(path.join(this.inboxPath, status), { recursive: true }))
    );
  }

  #normalizeFileUpload(file) {
    if (!file || !file.buffer) {
      throw createInboxError('EINBOX_INVALID_FILE', 'No file uploaded', 400);
    }

    const buffer = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
    const size = Number.isFinite(file.size) ? file.size : buffer.length;

    if (size <= 0) {
      throw createInboxError('EINBOX_INVALID_FILE', 'Uploaded file is empty', 400);
    }

    if (size > this.maxFileBytes) {
      throw createInboxError('EINBOX_SIZE_LIMIT', `File exceeds max size of ${this.maxFileBytes} bytes`, 413);
    }

    return {
      ...file,
      buffer,
      size,
      mimetype: String(file.mimetype || 'application/octet-stream').toLowerCase(),
      originalname: String(file.originalname || 'upload.bin')
    };
  }

  async #writeIncomingFile(filename, content, metadata) {
    await this.ensureDirectories();

    const destinationPath = path.join(this.inboxPath, 'incoming', filename);
    const metaPath = `${destinationPath}.meta.json`;
    const tmpSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempDestinationPath = `${destinationPath}.${tmpSuffix}.tmp`;
    const tempMetaPath = `${metaPath}.${tmpSuffix}.tmp`;

    try {
      await fs.writeFile(tempDestinationPath, content, { flag: 'wx' });
      await fs.rename(tempDestinationPath, destinationPath);
      await fs.writeFile(tempMetaPath, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
      await fs.rename(tempMetaPath, metaPath);
    } catch (error) {
      await Promise.all([
        fs.rm(tempDestinationPath, { force: true }),
        fs.rm(tempMetaPath, { force: true }),
        fs.rm(destinationPath, { force: true }),
        fs.rm(metaPath, { force: true })
      ]);
      throw error;
    }
  }
}

const defaultInboxService = new InboxService({
  inboxPath: defaultInboxPath,
  maxFileBytes: MAX_UPLOAD_BYTES,
  maxTextBytes: DEFAULT_MAX_TEXT_BYTES
});

export function validateUploadFile(file) {
  if (!file || !file.buffer) {
    throw createInboxError('EUPLOAD_VALIDATION', 'No file uploaded', 400);
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw createInboxError('EUPLOAD_VALIDATION', 'Uploaded file is empty', 400);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw createInboxError('EUPLOAD_VALIDATION', 'File too large (max 10MB)', 413);
  }

  const extension = path.extname(file.originalname || '').toLowerCase();
  const mimetype = String(file.mimetype || '').toLowerCase();
  const extensionAllowed = ALLOWED_UPLOAD_EXTENSIONS.has(extension);
  const mimetypeAllowed = ALLOWED_UPLOAD_MIME_TYPES.has(mimetype);

  if (!extensionAllowed && !mimetypeAllowed) {
    throw createInboxError('EUPLOAD_VALIDATION', 'Unsupported file type', 415);
  }

  return {
    ...file,
    originalname: sanitizeFilename(file.originalname, 'upload.bin'),
    mimetype: mimetype || 'application/octet-stream'
  };
}

export async function ensureInboxExists() {
  await defaultInboxService.ensureDirectories();
}

export async function saveText(content) {
  const result = await defaultInboxService.submitText('text', String(content), 'txt');
  return {
    filename: result.filename,
    size: result.metadata.size_bytes
  };
}

export async function saveFile(file) {
  const validatedFile = validateUploadFile(file);
  const result = await defaultInboxService.submitFile(validatedFile);
  return {
    filename: result.filename,
    size: result.metadata.size_bytes,
    originalName: validatedFile.originalname,
    mimetype: result.metadata.content_type
  };
}

export async function listInbox() {
  const items = await defaultInboxService.list('incoming');
  return items.map((item) => ({
    name: item.filename,
    size: item.size_bytes,
    created: new Date(item.metadata?.created_at || item.mtime),
    modified: new Date(item.mtime)
  }));
}
