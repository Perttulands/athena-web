import fs from 'node:fs/promises';
import path from 'node:path';

const PRD_FILE_PATTERN = /^PRD_.*\.md$/;

function createArtifactError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function normalizeRelativePath(inputPath) {
  if (inputPath === undefined || inputPath === null || inputPath === '') {
    return '';
  }

  if (typeof inputPath !== 'string') {
    throw createArtifactError('EARTIFACT_INVALID_PATH', 'Path must be a string', 400);
  }

  const normalized = path.normalize(inputPath);
  if (path.isAbsolute(normalized)) {
    throw createArtifactError('EARTIFACT_INVALID_PATH', 'Absolute paths are not allowed', 400);
  }

  return normalized === '.' ? '' : normalized;
}

function resolveWithinRoot(rootPath, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const resolvedPath = path.resolve(rootPath, normalized);
  const relativeToRoot = path.relative(rootPath, resolvedPath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw createArtifactError('EARTIFACT_INVALID_PATH', 'Path traversal blocked', 400);
  }

  return resolvedPath;
}

async function buildTree(startPath, basePath) {
  const entries = await fs.readdir(startPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const tree = [];
  for (const entry of entries) {
    const entryPath = path.join(startPath, entry.name);
    const relativePath = toPosixPath(path.relative(basePath, entryPath));

    if (entry.isDirectory()) {
      const children = await buildTree(entryPath, basePath);
      tree.push({ path: relativePath, type: 'dir', children });
      continue;
    }

    if (entry.isFile()) {
      tree.push({ path: relativePath, type: 'file' });
    }
  }

  return tree;
}

function createDefaultRoots(workspaceRoot, repoRoots) {
  return [
    {
      alias: 'research',
      label: 'Research',
      type: 'filesystem',
      path: path.join(workspaceRoot, 'docs', 'research'),
      readOnly: false
    },
    {
      alias: 'results',
      label: 'Results',
      type: 'filesystem',
      path: path.join(workspaceRoot, 'state', 'results'),
      readOnly: false
    },
    {
      alias: 'prds',
      label: 'PRDs',
      type: 'prds',
      repoRoots,
      readOnly: true
    },
    {
      alias: 'memory',
      label: 'Memory',
      type: 'filesystem',
      path: path.join(workspaceRoot, 'memory'),
      readOnly: true
    }
  ];
}

export class ArtifactService {
  constructor(options = {}) {
    const workspaceRoot = path.resolve(
      options.workspaceRoot || process.env.WORKSPACE_PATH || process.cwd()
    );

    const repoRoots = Array.isArray(options.repoRoots) && options.repoRoots.length > 0
      ? options.repoRoots.map((rootPath) => path.resolve(rootPath))
      : [workspaceRoot];

    const rootDefinitions = Array.isArray(options.roots) && options.roots.length > 0
      ? options.roots
      : createDefaultRoots(workspaceRoot, repoRoots);

    this.roots = new Map();

    for (const definition of rootDefinitions) {
      const alias = definition.alias;
      if (!alias) {
        throw new Error('Artifact root alias is required');
      }

      if (definition.type === 'prds') {
        const prdRepoRoots = Array.isArray(definition.repoRoots) && definition.repoRoots.length > 0
          ? definition.repoRoots.map((rootPath) => path.resolve(rootPath))
          : repoRoots;

        this.roots.set(alias, {
          alias,
          label: definition.label || alias,
          type: 'prds',
          repoRoots: prdRepoRoots,
          readOnly: true
        });
        continue;
      }

      if (!definition.path) {
        throw new Error(`Artifact root path is required for alias: ${alias}`);
      }

      this.roots.set(alias, {
        alias,
        label: definition.label || alias,
        type: 'filesystem',
        path: path.resolve(definition.path),
        readOnly: Boolean(definition.readOnly)
      });
    }
  }

  listRoots() {
    return Array.from(this.roots.values()).map((root) => ({
      alias: root.alias,
      label: root.label,
      type: root.type,
      readOnly: root.readOnly,
      writable: !root.readOnly
    }));
  }

  async getTree(rootAlias, subpath = '') {
    const root = this.#getRoot(rootAlias);

    if (root.type === 'prds') {
      const normalizedSubpath = normalizeRelativePath(subpath);
      if (normalizedSubpath !== '') {
        throw createArtifactError('EARTIFACT_INVALID_PATH', 'PRD root does not support subpaths', 400);
      }

      return this.#listPrdFiles(root.repoRoots);
    }

    const directoryPath = resolveWithinRoot(root.path, subpath);

    let stats;
    try {
      stats = await fs.stat(directoryPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    if (!stats.isDirectory()) {
      throw createArtifactError('EARTIFACT_NOT_FOUND', 'Requested path is not a directory', 404);
    }

    return buildTree(directoryPath, root.path);
  }

  async readDoc(rootAlias, relativeDocPath) {
    const { content } = await this.readDocWithMetadata(rootAlias, relativeDocPath);
    return content;
  }

  async readDocWithMetadata(rootAlias, relativeDocPath) {
    const root = this.#getRoot(rootAlias);

    const docPath = root.type === 'prds'
      ? this.#resolvePrdDocPath(root.repoRoots, relativeDocPath)
      : resolveWithinRoot(root.path, relativeDocPath);

    const stats = await this.#getExistingFileStats(docPath);

    const content = await fs.readFile(docPath, 'utf8');
    return {
      content,
      metadata: {
        mtime: stats.mtime.toISOString(),
        size: stats.size
      }
    };
  }

  #getRoot(rootAlias) {
    const root = this.roots.get(rootAlias);
    if (!root) {
      throw createArtifactError('EARTIFACT_UNKNOWN_ROOT', `Unknown artifact root: ${rootAlias}`, 404);
    }
    return root;
  }

  async #getExistingFileStats(docPath) {
    let stats;
    try {
      stats = await fs.stat(docPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw createArtifactError('EARTIFACT_NOT_FOUND', 'Document not found', 404);
      }
      throw error;
    }

    if (!stats.isFile()) {
      throw createArtifactError('EARTIFACT_NOT_FOUND', 'Document not found', 404);
    }

    return stats;
  }

  async #listPrdFiles(repoRoots) {
    const prefixWithRepoName = repoRoots.length > 1;
    const files = [];

    for (const repoRoot of repoRoots) {
      let entries;
      try {
        entries = await fs.readdir(repoRoot, { withFileTypes: true });
      } catch (error) {
        if (error.code === 'ENOENT') {
          continue;
        }
        throw error;
      }

      for (const entry of entries) {
        if (!entry.isFile() || !PRD_FILE_PATTERN.test(entry.name)) {
          continue;
        }

        const relativePath = prefixWithRepoName
          ? `${path.basename(repoRoot)}/${entry.name}`
          : entry.name;

        files.push({ path: relativePath, type: 'file' });
      }
    }

    files.sort((a, b) => a.path.localeCompare(b.path));
    return files;
  }

  #resolvePrdDocPath(repoRoots, relativeDocPath) {
    const normalized = normalizeRelativePath(relativeDocPath);
    if (!normalized) {
      throw createArtifactError('EARTIFACT_INVALID_PATH', 'Document path is required', 400);
    }

    if (repoRoots.length === 1) {
      if (normalized.includes(path.sep) || normalized.includes('/')) {
        throw createArtifactError('EARTIFACT_INVALID_PATH', 'PRD path must be a filename', 400);
      }

      if (!PRD_FILE_PATTERN.test(path.basename(normalized))) {
        throw createArtifactError('EARTIFACT_INVALID_PATH', 'PRD path must match PRD_*.md', 400);
      }

      return resolveWithinRoot(repoRoots[0], normalized);
    }

    const pathSegments = normalized.split(/[\\/]/).filter(Boolean);
    if (pathSegments.length !== 2) {
      throw createArtifactError('EARTIFACT_INVALID_PATH', 'PRD path must include repo and filename', 400);
    }

    const [repoName, fileName] = pathSegments;
    if (!PRD_FILE_PATTERN.test(fileName)) {
      throw createArtifactError('EARTIFACT_INVALID_PATH', 'PRD path must match PRD_*.md', 400);
    }

    const repoRoot = repoRoots.find((rootPath) => path.basename(rootPath) === repoName);
    if (!repoRoot) {
      throw createArtifactError('EARTIFACT_INVALID_PATH', 'Unknown PRD repository prefix', 400);
    }

    return resolveWithinRoot(repoRoot, fileName);
  }
}

export default ArtifactService;
