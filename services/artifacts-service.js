// Artifacts Service - Read markdown files from various locations
import { promises as fs } from 'node:fs';
import { join, resolve, relative, basename, extname, isAbsolute } from 'node:path';
import { homedir } from 'node:os';

const workspacePath = process.env.WORKSPACE_PATH || join(homedir(), '.openclaw', 'workspace');

// Artifact source directories
const artifactSources = [
  { name: 'Research', path: join(workspacePath, 'docs', 'research') },
  { name: 'Results', path: join(workspacePath, 'state', 'results') },
  { name: 'Memory', path: join(workspacePath, 'memory') },
  { name: 'PRDs', path: workspacePath, pattern: /^PRD_.*\.md$/, recursive: false }
];

/**
 * Validate that a path is inside an allowed directory root.
 */
function isPathWithin(candidatePath, allowedBase) {
  const rel = relative(allowedBase, candidatePath);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function createAccessError() {
  const error = new Error('Invalid artifact path');
  error.code = 'EARTIFACT_ACCESS';
  error.status = 403;
  return error;
}

function encodeArtifactPath(path) {
  return Buffer.from(path, 'utf-8').toString('base64url');
}

/**
 * Recursively scan a directory for markdown files.
 */
async function scanDirectory(dirPath, options = {}) {
  const { pattern = null, recursive = true } = options;
  const files = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory() && recursive) {
        const subFiles = await scanDirectory(fullPath, options);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        if (pattern && !pattern.test(entry.name)) {
          continue;
        }
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or is not accessible - skip silently
    if (error.code !== 'ENOENT' && error.code !== 'EACCES') {
      throw error;
    }
  }

  return files;
}

/**
 * Get all available artifacts grouped by category.
 */
export async function getArtifacts() {
  const artifacts = [];

  for (const source of artifactSources) {
    const sourcePath = resolve(source.path);
    const files = await scanDirectory(sourcePath, {
      pattern: source.pattern,
      recursive: source.recursive !== false
    });

    const items = files.map((filePath) => {
      const rel = relative(sourcePath, filePath);
      return {
        category: source.name,
        name: rel,
        basename: basename(filePath),
        encodedPath: encodeArtifactPath(filePath)
      };
    });

    artifacts.push(...items);
  }

  artifacts.sort((a, b) =>
    a.category.localeCompare(b.category) ||
    a.name.localeCompare(b.name)
  );

  return artifacts;
}

/**
 * Read the content of a specific artifact.
 */
export async function readArtifact(artifactPath) {
  if (typeof artifactPath !== 'string' || artifactPath.trim() === '') {
    const error = new Error('Artifact path is required');
    error.code = 'EARTIFACT_INVALID';
    error.status = 400;
    throw error;
  }

  const resolvedPath = resolve(artifactPath.trim());
  if (extname(resolvedPath).toLowerCase() !== '.md') {
    throw createAccessError();
  }

  // Validate path is within one of the allowed sources
  const allowedLexical = artifactSources.some((source) =>
    isPathWithin(resolvedPath, resolve(source.path))
  );

  if (!allowedLexical) {
    throw createAccessError();
  }

  const realArtifactPath = await fs.realpath(resolvedPath);
  const allowedChecks = await Promise.all(
    artifactSources.map(async (source) => {
      try {
        const realSourcePath = await fs.realpath(resolve(source.path));
        return isPathWithin(realArtifactPath, realSourcePath);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return false;
        }
        throw error;
      }
    })
  );

  if (!allowedChecks.some(Boolean)) {
    throw createAccessError();
  }

  const stats = await fs.stat(realArtifactPath);
  if (!stats.isFile()) {
    throw createAccessError();
  }

  const content = await fs.readFile(realArtifactPath, 'utf-8');
  return content;
}
