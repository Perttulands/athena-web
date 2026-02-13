import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

describe('artifacts-service', () => {
  let workspaceDir;
  let outsideDir;
  let artifactsService;

  before(async () => {
    workspaceDir = join(os.tmpdir(), `athena-artifacts-workspace-${Date.now()}`);
    outsideDir = join(os.tmpdir(), `athena-artifacts-outside-${Date.now()}`);

    await fs.mkdir(join(workspaceDir, 'docs', 'research'), { recursive: true });
    await fs.mkdir(join(workspaceDir, 'state', 'results'), { recursive: true });
    await fs.mkdir(join(workspaceDir, 'memory'), { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });

    await fs.writeFile(join(workspaceDir, 'docs', 'research', 'study.md'), '# Study');
    await fs.writeFile(join(workspaceDir, 'state', 'results', 'summary.md'), '# Results');
    await fs.writeFile(join(workspaceDir, 'memory', 'notes.md'), '# Memory');
    await fs.writeFile(join(workspaceDir, 'PRD_ALPHA.md'), '# PRD');
    await fs.writeFile(join(workspaceDir, 'memory', 'secret.txt'), 'nope');
    await fs.writeFile(join(outsideDir, 'outside.md'), '# Outside');

    await fs.symlink(
      join(outsideDir, 'outside.md'),
      join(workspaceDir, 'memory', 'escape.md')
    );

    process.env.WORKSPACE_PATH = workspaceDir;
    artifactsService = await import(`../../services/artifacts-service.js?t=${Date.now()}`);
  });

  after(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
    await fs.rm(outsideDir, { recursive: true, force: true });
    delete process.env.WORKSPACE_PATH;
  });

  it('lists artifacts with encoded paths only', async () => {
    const artifacts = await artifactsService.getArtifacts();

    assert.ok(artifacts.length >= 4, 'expected test markdown files to be listed');
    assert.ok(
      artifacts.every((artifact) => typeof artifact.encodedPath === 'string' && artifact.encodedPath.length > 0),
      'every artifact should include encodedPath'
    );
    assert.ok(
      artifacts.every((artifact) => !Object.prototype.hasOwnProperty.call(artifact, 'path')),
      'artifact response should not expose absolute path'
    );
  });

  it('reads markdown content from allowed directories', async () => {
    const content = await artifactsService.readArtifact(join(workspaceDir, 'memory', 'notes.md'));
    assert.equal(content, '# Memory');
  });

  it('rejects non-markdown artifacts', async () => {
    await assert.rejects(
      async () => artifactsService.readArtifact(join(workspaceDir, 'memory', 'secret.txt')),
      (error) => error.code === 'EARTIFACT_ACCESS'
    );
  });

  it('rejects paths outside artifact roots', async () => {
    await assert.rejects(
      async () => artifactsService.readArtifact('/etc/passwd'),
      (error) => error.code === 'EARTIFACT_ACCESS'
    );
  });

  it('rejects symlink escapes outside allowed roots', async () => {
    await assert.rejects(
      async () => artifactsService.readArtifact(join(workspaceDir, 'memory', 'escape.md')),
      (error) => error.code === 'EARTIFACT_ACCESS'
    );
  });
});
