# Code Review — Athena Web

Date: 2026-02-20

---

## Dead Code / Unused Files

- **`banner.jpg.bak`** — committed backup file, safe to delete
- **`public/test-components.html`**, **`public/test-tokens.html`** — dev test pages served as static files in production; should be behind a dev-only flag or removed from `public/`
- **`IMPROVEMENTS.md`**, **`PLAN_PORTAL.md`**, **`PRD_ATHENA_WEB_V1.md`**, **`PRD_ATHENA_WEB_V2.md`**, **`PRD-portal-remaining.md`** — stale planning artifacts in repo root, not linked from anywhere active
- **`progress_athena_web.txt`** — ralph progress state file checked into repo root; should be in `state/` or gitignored
- **`package.json`** has no `test` script despite a full test suite in `tests/`; running tests requires knowing the test runner directly

---

## Obvious Bugs

- **`inbox-service.js:10-11`** — module-level `workspacePath` defaults to `~/.openclaw/workspace` (stale path), not `~/athena` as defined in `config.js`. The `defaultInboxService` and exported functions (`saveText`, `saveFile`, `listInbox`) use this stale default instead of reading from `config`. Only routes that construct `new InboxService({ inboxPath: config.inboxPath })` get the correct path.

- **`routes/status.js:102-103`** — `prdPath` and `progressPath` are bare relative strings (`'PRD_ATHENA_WEB.md'`, `'progress_athena_web.txt'`). `ralph-service.js` passes these directly to `readFile`, making the call CWD-dependent. If the server is started from a directory other than the project root, these silently return empty data (the service swallows the ENOENT).

- **`tmux-service.js:75`** — `listAgents` always sets `status: 'running'` for every tmux session. A session that exists but has exited (zombie) will appear as running. There is no liveness check.

---

## Missing Error Handling

- **`routes/artifacts.js:200`** — `spawn('rg', ...)` has no `ENOENT` guard. If `ripgrep` is not installed, the `child.on('error')` rejects with an opaque spawn error rather than a helpful 503/dependency-missing message.

- **`services/artifact-service.js:46-67`** — `buildTree` recurses into directories without a depth limit. A deeply nested or symlink-looped directory could cause a stack overflow or hang.

- **`inbox-service.js:302-309`** — the cleanup block in `#writeIncomingFile` calls `fs.rm` on both temp and final paths on any error, including errors that occur *after* the first rename succeeds. This could delete a successfully written file if the meta write fails.

---

## Inconsistencies Between Docs and Code

- **`config.js:42`** — `beadsCli` defaults to `'br'`; `CLAUDE.md` says `Beads CLI: br`. But the git history includes a merged PR (`migrate-br-to-bd`) that switched to `bd`. The `.beads/` data directory (bd's format) is deleted in the working tree, suggesting the project migrated back to `br`. Docs and code agree now, but the history is confusing — no CHANGELOG entry documents the reversal.

- **`server.js:113`** — test routes check `process.env.NODE_ENV !== 'production'` directly, while the rest of the server uses `config.nodeEnv`. One source of truth should be used throughout.

- **`inbox-service.js:14`** — `MAX_UPLOAD_BYTES = 10MB` is exported "for backward compatibility" with a comment, but it is actively used by `defaultInboxService` and `validateUploadFile`. `config.js` also defines `maxUploadBytes: 10MB`. The service's own `DEFAULT_MAX_FILE_BYTES = 25MB` is never used by the default instance — silent dead constant.

- **`routes/status.js:39-43`** — response shape includes both `open`/`closed` (raw bead statuses) and `todo`/`active`/`done`/`failed` (canonical), making the API contract unclear. The frontend likely only uses canonical; the raw counts are noise.

---

## TODO / FIXME / HACK

No literal `TODO`, `FIXME`, or `HACK` comments found in source. The `XXX` in `ralph-service.js:6` is part of a regex pattern string, not a flag comment.

---

## Minor / Style

- **`services/artifact-watch-service.js`** (not read in full) — watch service is created in `server.js` only on startup, not exported for test use. The watcher is never stopped on graceful shutdown (`SIGTERM`), which may cause hanging in tests.
- **`.gitignore`** uses `ralph-*.log` (dash separator) but two committed log files use underscores (`ralph_athena_web.log`, `ralph_athena_web_0745.log`) and slip through — they are present in the working tree.
