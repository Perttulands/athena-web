import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ArtifactService } from '../../services/artifact-service.js';

describe('ArtifactService', () => {
  let workspaceDir;
  let service;

  before(async () => {
    workspaceDir = path.join(os.tmpdir(), `athena-artifact-service-${Date.now()}`);

    await fs.mkdir(path.join(workspaceDir, 'docs', 'research', 'topic'), { recursive: true });
    await fs.mkdir(path.join(workspaceDir, 'state', 'results'), { recursive: true });
    await fs.mkdir(path.join(workspaceDir, 'memory'), { recursive: true });

    await fs.writeFile(path.join(workspaceDir, 'docs', 'research', 'notes.md'), '# Notes');
    await fs.writeFile(path.join(workspaceDir, 'docs', 'research', 'topic', 'deep.md'), '# Deep');
    await fs.writeFile(path.join(workspaceDir, 'state', 'results', 'summary.md'), '# Summary');
    await fs.writeFile(path.join(workspaceDir, 'memory', 'memo.md'), '# Memo');
    await fs.writeFile(path.join(workspaceDir, 'PRD_ALPHA.md'), '# Alpha PRD');
    await fs.writeFile(path.join(workspaceDir, 'README.md'), '# Not a PRD');

    service = new ArtifactService({
      workspaceRoot: workspaceDir,
      repoRoots: [workspaceDir]
    });
  });

  after(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it('lists configured roots with read-only flag', () => {
    const roots = service.listRoots();
    assert.deepEqual(
      roots.map((root) => root.alias),
      ['research', 'results', 'prds', 'memory']
    );

    const memoryRoot = roots.find((root) => root.alias === 'memory');
    assert.equal(memoryRoot.readOnly, true);

    const researchRoot = roots.find((root) => root.alias === 'research');
    assert.equal(researchRoot.readOnly, false);
  });

  it('enumerates tree entries for filesystem roots', async () => {
    const tree = await service.getTree('research');

    const notes = tree.find((entry) => entry.path === 'notes.md');
    assert.equal(notes.type, 'file');

    const topic = tree.find((entry) => entry.path === 'topic');
    assert.equal(topic.type, 'dir');
    assert.ok(topic.children.some((entry) => entry.path === 'topic/deep.md'));
  });

  it('enumerates only PRD files for prds root', async () => {
    const tree = await service.getTree('prds');

    assert.ok(tree.some((entry) => entry.path === 'PRD_ALPHA.md'));
    assert.equal(tree.some((entry) => entry.path === 'README.md'), false);
  });

  it('reads document content from mapped roots', async () => {
    const content = await service.readDoc('results', 'summary.md');
    assert.equal(content, '# Summary');
  });

  it('blocks path traversal attempts', async () => {
    await assert.rejects(
      service.readDoc('research', '../../etc/passwd'),
      (error) => error.code === 'EARTIFACT_INVALID_PATH' && error.status === 400
    );
  });

  it('rejects unknown roots', async () => {
    await assert.rejects(
      service.getTree('unknown-root'),
      (error) => error.code === 'EARTIFACT_UNKNOWN_ROOT' && error.status === 404
    );
  });
});
