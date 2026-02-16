import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import config from '../config.js';
import { ArtifactService } from '../services/artifact-service.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = express.Router();
const artifactService = new ArtifactService({
  workspaceRoot: config.workspacePath,
  repoRoots: config.artifactRoots
});

const DEFAULT_SEARCH_LIMIT = 50;
const MAX_SEARCH_LIMIT = 200;
const RESULT_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;
const SUMMARY_PREVIEW_MAX_CHARS = 260;

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

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function parseSearchLimit(rawLimit) {
  if (!rawLimit) {
    return DEFAULT_SEARCH_LIMIT;
  }

  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    const error = new Error('Query parameter "limit" must be a positive integer');
    error.status = 400;
    throw error;
  }

  return Math.min(parsed, MAX_SEARCH_LIMIT);
}

function parseSearchRoots(rawRoots) {
  const availableRoots = new Set(artifactService.listRoots().map((root) => root.alias));
  const providedRoots = rawRoots
    ? rawRoots.split(',').map((item) => item.trim()).filter(Boolean)
    : Array.from(availableRoots);

  if (providedRoots.length === 0) {
    const error = new Error('Query parameter "roots" must contain at least one root alias');
    error.status = 400;
    throw error;
  }

  const uniqueRoots = [...new Set(providedRoots)];

  for (const root of uniqueRoots) {
    if (!availableRoots.has(root)) {
      const error = new Error(`Unknown artifact root: ${root}`);
      error.status = 400;
      throw error;
    }
  }

  return uniqueRoots;
}

function parseSearchQuery(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') {
    const error = new Error('Query parameter "q" is required');
    error.status = 400;
    throw error;
  }

  if (rawQuery.includes('\0')) {
    const error = new Error('Query parameter "q" contains invalid characters');
    error.status = 400;
    throw error;
  }

  const trimmed = rawQuery.trim();
  if (!trimmed) {
    const error = new Error('Query parameter "q" must not be empty');
    error.status = 400;
    throw error;
  }

  return trimmed;
}

function createSearchScopes(rootAliases) {
  const scopes = [];

  for (const alias of rootAliases) {
    const root = artifactService.roots.get(alias);
    if (!root) {
      const error = new Error(`Unknown artifact root: ${alias}`);
      error.status = 400;
      throw error;
    }

    if (root.type === 'prds') {
      const includeRepoPrefix = root.repoRoots.length > 1;
      for (const repoRoot of root.repoRoots) {
        scopes.push({
          rootAlias: alias,
          searchPath: repoRoot,
          pathPrefix: includeRepoPrefix ? path.basename(repoRoot) : ''
        });
      }
      continue;
    }

    scopes.push({
      rootAlias: alias,
      searchPath: root.path,
      pathPrefix: ''
    });
  }

  return scopes;
}

function parseRipgrepLine(line) {
  const firstColon = line.indexOf(':');
  if (firstColon === -1) {
    return null;
  }

  const secondColon = line.indexOf(':', firstColon + 1);
  if (secondColon === -1) {
    return null;
  }

  const filePath = line.slice(0, firstColon);
  const lineNumber = Number.parseInt(line.slice(firstColon + 1, secondColon), 10);
  const snippet = line.slice(secondColon + 1);

  if (!filePath || !Number.isInteger(lineNumber)) {
    return null;
  }

  return {
    path: filePath,
    line: lineNumber,
    snippet
  };
}

function normalizeRipgrepPath(filePath) {
  const normalized = toPosixPath(filePath);
  return normalized.startsWith('./') ? normalized.slice(2) : normalized;
}

async function ensureSearchPathExists(searchPath) {
  try {
    const stats = await fs.stat(searchPath);
    return stats.isDirectory();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function runRipgrepSearch(scope, query, limit) {
  if (limit <= 0) {
    return [];
  }

  if (!(await ensureSearchPathExists(scope.searchPath))) {
    return [];
  }

  const args = ['-n', '--no-heading', '--color', 'never', '--', query, '.'];

  const output = await new Promise((resolve, reject) => {
    const child = spawn('rg', args, {
      cwd: scope.searchPath,
      shell: false,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0 || code === 1) {
        resolve(stdout);
        return;
      }

      const error = new Error(stderr.trim() || `ripgrep failed with code ${code}`);
      error.status = 500;
      reject(error);
    });
  });

  const results = [];
  const lines = output.split('\n');

  for (const rawLine of lines) {
    if (!rawLine) {
      continue;
    }

    const parsed = parseRipgrepLine(rawLine);
    if (!parsed) {
      continue;
    }

    const normalizedPath = normalizeRipgrepPath(parsed.path);
    const relativePath = scope.pathPrefix
      ? `${scope.pathPrefix}/${normalizedPath}`
      : normalizedPath;

    results.push({
      root: scope.rootAlias,
      path: relativePath,
      line: parsed.line,
      snippet: parsed.snippet
    });

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

function getResultsRootPath() {
  const resultsRoot = artifactService.roots.get('results');
  if (!resultsRoot || resultsRoot.type !== 'filesystem') {
    const error = new Error('Artifact results root is not configured');
    error.status = 500;
    throw error;
  }

  return resultsRoot.path;
}

function sanitizeArtifactId(rawId) {
  const id = String(rawId || '')
    .trim()
    .replace(/\.json$/i, '');

  if (!id || !RESULT_ID_PATTERN.test(id)) {
    const error = new Error('Artifact id must contain only letters, numbers, ".", "_" or "-"');
    error.status = 400;
    throw error;
  }

  return id;
}

function parseArtifactTimestamp(value, fallbackIso) {
  if (typeof value !== 'string' || value.trim() === '') {
    return fallbackIso;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return fallbackIso;
  }

  return new Date(parsed).toISOString();
}

function pickFirstString(payload, keys) {
  for (const key of keys) {
    if (typeof payload?.[key] === 'string' && payload[key].trim() !== '') {
      return payload[key];
    }
  }

  return '';
}

function pickFirstValue(payload, keys) {
  for (const key of keys) {
    if (payload && Object.prototype.hasOwnProperty.call(payload, key)) {
      return payload[key];
    }
  }

  return null;
}

function previewText(value, maxChars = SUMMARY_PREVIEW_MAX_CHARS) {
  const compact = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (compact.length <= maxChars) {
    return compact;
  }

  return `${compact.slice(0, maxChars - 1)}…`;
}

function normalizeResultRecord(fileName, payload, stats) {
  const id = path.basename(fileName, '.json');
  const fallbackIso = stats?.mtime?.toISOString?.() || new Date().toISOString();
  const startedAt = parseArtifactTimestamp(payload.started_at, fallbackIso);
  const finishedAt = parseArtifactTimestamp(payload.finished_at || payload.completed_at, fallbackIso);
  const summary = pickFirstString(payload, ['output_summary', 'summary', 'report', 'notes']);
  const diff = pickFirstString(payload, ['diff', 'code_diff', 'patch']);
  const logOutput = pickFirstString(payload, ['logs', 'log', 'stdout', 'stderr', 'output']);
  const tests = pickFirstValue(payload, ['test_results', 'tests']);
  const verification = pickFirstValue(payload, ['verification']);

  return {
    id,
    file: fileName,
    title: payload.bead || payload.run_id || payload.id || id,
    bead: payload.bead || null,
    agent: payload.agent || null,
    model: payload.model || null,
    status: payload.status || 'unknown',
    startedAt,
    finishedAt,
    durationSeconds: Number.isFinite(payload.duration_seconds)
      ? payload.duration_seconds
      : null,
    exitCode: Number.isFinite(payload.exit_code)
      ? payload.exit_code
      : null,
    reason: payload.reason || null,
    summary,
    summaryPreview: previewText(summary),
    diff,
    logOutput,
    tests,
    verification,
    updatedAt: finishedAt,
    payload
  };
}

async function readResultRecordById(rawId) {
  const id = sanitizeArtifactId(rawId);
  const resultsRoot = getResultsRootPath();
  const fileName = `${id}.json`;
  const filePath = path.join(resultsRoot, fileName);

  let content;
  let stats;

  try {
    [content, stats] = await Promise.all([
      fs.readFile(filePath, 'utf8'),
      fs.stat(filePath)
    ]);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const notFound = new Error(`Artifact not found: ${id}`);
      notFound.status = 404;
      throw notFound;
    }
    throw error;
  }

  if (!stats.isFile()) {
    const notFound = new Error(`Artifact not found: ${id}`);
    notFound.status = 404;
    throw notFound;
  }

  let payload;
  try {
    payload = JSON.parse(content);
  } catch (error) {
    const invalid = new Error(`Artifact JSON is invalid: ${fileName}`);
    invalid.status = 500;
    throw invalid;
  }

  return normalizeResultRecord(fileName, payload, stats);
}

async function listResultRecords() {
  const resultsRoot = getResultsRootPath();

  let entries;
  try {
    entries = await fs.readdir(resultsRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const artifacts = await Promise.all(jsonFiles.map(async (fileName) => {
    const filePath = path.join(resultsRoot, fileName);

    try {
      const [content, stats] = await Promise.all([
        fs.readFile(filePath, 'utf8'),
        fs.stat(filePath)
      ]);
      const payload = JSON.parse(content);
      return normalizeResultRecord(fileName, payload, stats);
    } catch {
      return null;
    }
  }));

  return artifacts
    .filter(Boolean)
    .sort((left, right) => (
      Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0)
    ));
}

function stringifyObjectBlock(value, fallback = '{}') {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

function buildResultMarkdown(record) {
  const sections = [
    `# Artifact ${record.title || record.id}`,
    '',
    `- **ID:** \`${record.id}\``,
    `- **Status:** \`${record.status || 'unknown'}\``,
    `- **Agent:** ${record.agent || 'unknown'}`,
    `- **Bead:** ${record.bead || 'n/a'}`,
    `- **Started:** ${record.startedAt || 'n/a'}`,
    `- **Finished:** ${record.finishedAt || 'n/a'}`,
    `- **Exit Code:** ${record.exitCode ?? 'n/a'}`
  ];

  if (record.summary) {
    sections.push('', '## Summary', '', record.summary);
  }

  if (record.diff) {
    sections.push('', '## Code Diff', '', '```diff', record.diff, '```');
  }

  if (record.tests !== null) {
    sections.push('', '## Test Results', '', '```json', stringifyObjectBlock(record.tests, '{}'), '```');
  }

  if (record.verification !== null) {
    sections.push('', '## Verification', '', '```json', stringifyObjectBlock(record.verification, '{}'), '```');
  }

  if (record.logOutput) {
    sections.push('', '## Logs', '', '```text', record.logOutput, '```');
  }

  sections.push('', '## Raw JSON', '', '```json', stringifyObjectBlock(record.payload, '{}'), '```');

  return sections.join('\n');
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

router.get('/results', asyncHandler(async (req, res) => {
  const records = await listResultRecords();
  const artifacts = records.map((record) => ({
    id: record.id,
    title: record.title,
    bead: record.bead,
    agent: record.agent,
    model: record.model,
    status: record.status,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationSeconds: record.durationSeconds,
    exitCode: record.exitCode,
    reason: record.reason,
    summaryPreview: record.summaryPreview,
    updatedAt: record.updatedAt
  }));

  res.json({ artifacts });
}));

router.get('/results/:id', asyncHandler(async (req, res) => {
  const record = await readResultRecordById(req.params.id);
  const markdown = buildResultMarkdown(record);

  res.json({
    artifact: {
      id: record.id,
      title: record.title,
      bead: record.bead,
      agent: record.agent,
      model: record.model,
      status: record.status,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      durationSeconds: record.durationSeconds,
      exitCode: record.exitCode,
      reason: record.reason,
      summaryPreview: record.summaryPreview,
      updatedAt: record.updatedAt
    },
    markdown
  });
}));

router.get('/search', asyncHandler(async (req, res) => {
  const query = parseSearchQuery(getSingleQueryParam(req, 'q', ''));
  const roots = parseSearchRoots(getSingleQueryParam(req, 'roots', ''));
  const limit = parseSearchLimit(getSingleQueryParam(req, 'limit', ''));

  const scopes = createSearchScopes(roots);
  const results = [];

  for (const scope of scopes) {
    if (results.length >= limit) {
      break;
    }

    const remaining = limit - results.length;
    const scopeResults = await runRipgrepSearch(scope, query, remaining);
    results.push(...scopeResults);
  }

  res.json({ results });
}));

export default router;
