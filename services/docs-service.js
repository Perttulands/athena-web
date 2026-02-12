import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Validates that a file path is within the workspace directory.
 * Prevents path traversal attacks (.. or absolute paths).
 * @param {string} workspaceRoot - Absolute path to workspace root
 * @param {string} relativePath - User-provided relative path
 * @returns {string} Resolved absolute path (if valid)
 * @throws {Error} If path is outside workspace
 */
function validatePath(workspaceRoot, relativePath) {
  // Normalize the relative path to prevent tricks like "foo/../../../etc/passwd"
  const normalized = path.normalize(relativePath);

  // Reject absolute paths
  if (path.isAbsolute(normalized)) {
    throw new Error('Path must be relative (no absolute paths allowed) and cannot resolve outside workspace');
  }

  // Resolve the full path
  const fullPath = path.resolve(workspaceRoot, normalized);

  // Ensure the resolved path is still within workspace
  const relative = path.relative(workspaceRoot, fullPath);

  // If relative path starts with '..' or is empty, it's outside workspace
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path resolves outside workspace directory (path traversal blocked)');
  }

  return fullPath;
}

/**
 * Recursively builds a tree structure of files and directories.
 * @param {string} dirPath - Absolute path to directory
 * @param {string} basePath - Base path for computing relative paths
 * @returns {Promise<Array>} Array of file/dir objects with { path, type, children? }
 */
async function buildTree(dirPath, basePath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const tree = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    if (entry.isDirectory()) {
      const children = await buildTree(fullPath, basePath);
      tree.push({
        path: relativePath,
        type: 'dir',
        children
      });
    } else if (entry.isFile()) {
      tree.push({
        path: relativePath,
        type: 'file'
      });
    }
  }

  return tree;
}

/**
 * Get the full file tree of the workspace directory.
 * @param {string} workspaceRoot - Absolute path to workspace root
 * @returns {Promise<Array>} Tree structure
 */
export async function getTree(workspaceRoot) {
  try {
    const tree = await buildTree(workspaceRoot, workspaceRoot);
    return tree;
  } catch (error) {
    // If directory doesn't exist or is empty, return empty array
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Read a document file from the workspace.
 * @param {string} workspaceRoot - Absolute path to workspace root
 * @param {string} relativePath - Relative path to file
 * @returns {Promise<string>} File contents
 * @throws {Error} If path is invalid or file doesn't exist
 */
export async function readDoc(workspaceRoot, relativePath) {
  const fullPath = validatePath(workspaceRoot, relativePath);
  const content = await fs.readFile(fullPath, 'utf8');
  return content;
}

/**
 * Write a document file to the workspace.
 * @param {string} workspaceRoot - Absolute path to workspace root
 * @param {string} relativePath - Relative path to file
 * @param {string} content - File content to write
 * @returns {Promise<void>}
 * @throws {Error} If path is invalid
 */
export async function writeDoc(workspaceRoot, relativePath, content) {
  const fullPath = validatePath(workspaceRoot, relativePath);

  // Ensure parent directory exists
  const dirPath = path.dirname(fullPath);
  await fs.mkdir(dirPath, { recursive: true });

  await fs.writeFile(fullPath, content, 'utf8');
}
