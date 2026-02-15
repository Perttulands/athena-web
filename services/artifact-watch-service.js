/**
 * ArtifactWatchService
 * Watches artifact roots and inbox directories for changes via chokidar.
 * Emits debounced events to the SSE service.
 */

import chokidar from 'chokidar';
import { join } from 'node:path';

const DEFAULT_DEBOUNCE_MS = 300;

export class ArtifactWatchService {
  constructor(options = {}) {
    this.sseService = options.sseService || null;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.watchers = [];
    this.timers = new Map();
    this.started = false;
  }

  start(artifactRoots = [], inboxPath = '') {
    if (this.started) return;
    this.started = true;
    this._readyPromises = [];

    for (const root of artifactRoots) {
      if (root.path) {
        this.#watchDirectory('artifact', root.alias || root.path, root.path);
      }
    }

    if (inboxPath) {
      const subdirs = ['incoming', 'processing', 'done', 'failed'];
      for (const subdir of subdirs) {
        this.#watchDirectory('inbox', subdir, join(inboxPath, subdir));
      }
    }
  }

  async ready() {
    if (this._readyPromises) {
      await Promise.all(this._readyPromises);
    }
  }

  stop() {
    this.started = false;

    for (const watcher of this.watchers) {
      watcher.close().catch(() => {});
    }
    this.watchers = [];

    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  #watchDirectory(source, label, dirPath) {
    try {
      const watcher = chokidar.watch(dirPath, {
        ignoreInitial: true,
        depth: 5,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 }
      });

      const handler = (eventType, filePath) => {
        this.#debounceEmit(source, label, eventType, filePath);
      };

      watcher.on('add', (fp) => handler('add', fp));
      watcher.on('change', (fp) => handler('change', fp));
      watcher.on('unlink', (fp) => handler('unlink', fp));
      watcher.on('error', (err) => {
        if (err.code !== 'ENOENT') {
          console.warn(`ArtifactWatch error on ${dirPath}:`, err.message);
        }
      });

      const readyPromise = new Promise((resolve) => {
        watcher.on('ready', resolve);
      });
      this._readyPromises.push(readyPromise);

      this.watchers.push(watcher);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`ArtifactWatch failed to watch ${dirPath}:`, err.message);
      }
    }
  }

  #debounceEmit(source, root, eventType, filePath) {
    const key = `${source}:${root}:${filePath}`;

    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key);
      this.#emit(source, root, eventType, filePath);
    }, this.debounceMs));
  }

  #emit(source, root, eventType, filePath) {
    if (!this.sseService) return;

    const sseEventType = source === 'inbox' ? 'inbox_update' : 'artifact_update';
    const payload = {
      source,
      root,
      eventType,
      file: filePath,
      ts: new Date().toISOString()
    };

    this.sseService.broadcast(sseEventType, payload);
  }
}
