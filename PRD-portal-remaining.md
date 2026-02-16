# PRD: Athena Portal — Tasks 7–13 Implementation Specification

> Companion to `PRD_ATHENA_WEB.md`. Tasks 1–6 are complete (224 tests passing).
> This document contains everything an implementor needs to build Tasks 7–13 without ambiguity.

---

## Architecture Overview

Before diving into tasks, understand the lay of the land.

### Backend Patterns

| Pattern | Example | Notes |
|---------|---------|-------|
| Service class | `ArtifactService` | Constructor takes `options`, pure logic, no Express |
| Route module | `routes/artifacts.js` | Thin Express router, delegates to service, uses `asyncHandler` |
| Error convention | `createArtifactError(code, message, status)` | Custom errors with `.code`, `.status` fields |
| Registration | `server.js` imports router, mounts at `/api/<name>` | Never modify existing route mounts |
| Config | `config.js` exports singleton object with env-backed getters | All new fields need defaults |

### Frontend Patterns

| Pattern | Example | Notes |
|---------|---------|-------|
| Page module | `pages/portal.js` | Exports `render()` → HTML string, `mount(root)` → cleanup fn |
| API calls | `api.get('/artifacts/roots')` | Singleton `ApiClient` with 5s cache, `clearCache()` on mutations |
| SSE | `sse.on('artifact_update', handler)` | Register in `mount()`, unregister in cleanup |
| Components | `createToast()`, `createLoadingSkeleton()` | Factory functions returning DOM elements |
| CSS | `pages.css` | All page styles in one file, dark theme with `var(--gold)` tokens |
| DOM | No innerHTML for dynamic data | Use `createElement` + `textContent` (XSS-safe) |

### Test Patterns

| Layer | Tool | Example |
|-------|------|---------|
| Service unit | `node:test` + `assert/strict` + temp dirs | `tests/services/artifact-service.test.js` |
| Route | `node:test` + `canListen()` guard + real HTTP | `tests/routes/inbox.test.js` |
| Frontend | JSDOM + mock `fetch` + mock SSE | `tests/frontend/pages/portal.test.js` |
| Integration | Real server on random port, full flow | `tests/integration/portal.test.js` |
| Run command | `node --test "tests/**/*.test.js"` | Must stay at 0 failures |

---

## Task 7: Artifact Browser UI

**Status:** ✅ Complete

The artifact browser is fully implemented in `public/js/pages/portal.js` as the `portalArtifactsTab` object. It includes:
- Root selector dropdown with label display
- Collapsible file tree (`<details>`/`<summary>` for directories)
- Markdown viewer with heading anchors, code blocks, and table rendering
- Search bar with `/` keyboard shortcut and `Escape` to clear
- SSE-driven tree refresh on `artifact_update` events
- Mobile-responsive layout with toggle button for sidebar

Tests: `tests/frontend/pages/portal.test.js` — 10 assertions covering tree render, doc load, search, keyboard shortcuts, empty states, SSE refresh.

---

## Task 8: Inbox UI

**Status:** ✅ Complete

The inbox UI is implemented in `public/js/pages/inbox.js` and integrated as a portal tab. It includes:
- Drag-drop zone with visual feedback (`.drag-over` class)
- File picker with extension validation
- Textarea with title input and format selector (`md`/`txt`)
- "Send to Athena" submit button
- Queue list with status badges (`incoming`/`done`/`failed`)
- 44px+ touch targets on mobile

Tests: `tests/frontend/pages/portal.test.js` — upload triggers API, text submit sends title/format, queue renders items with badges.

---

## Task 9: File Watcher Service

**Status:** ✅ Complete

`services/artifact-watch-service.js` implements `ArtifactWatchService`:
- Uses chokidar with `ignoreInitial: true`, `depth: 5`, `awaitWriteFinish`
- Debounces at configurable interval (default 300ms)
- Emits `artifact_update` and `inbox_update` via `sseService.broadcast()`
- Watches all filesystem artifact roots + inbox subdirs
- Started in `server.js` after `app.listen()`

Tests: `tests/services/artifact-watch-service.test.js` — 5 tests covering emit on change, inbox events, debounce, cleanup, missing dirs.

---

## Task 10: Wire SSE to Portal UI

**Status:** ✅ Complete

In `portal.js`:
- `artifact_update` handler: clears API cache, refreshes tree, reloads current doc if affected
- `inbox_update` handler: re-renders inbox tab
- Visual feedback: `.sse-flash` class on sidebar (0.6s gold border pulse)

In `sse.js`: Event types `artifact_update` and `inbox_update` are registered in the `EventSource` listener array.

Tests: `tests/frontend/pages/portal.test.js` — SSE event triggers tree refresh assertion.

---

## Task 11: Security Hardening

**Status:** ✅ Complete

Implemented across multiple files:

| Security measure | Location | Details |
|------------------|----------|---------|
| CORS same-origin | `server.js` | `origin` callback rejects non-null origins in production |
| Memory read-only | `ArtifactService` constructor | `readOnly: true` on memory root; API returns `writable: false` |
| Filename sanitization | `InboxService.sanitizeFilename()` | Strips `..`, `/`, special chars, lowercases |
| Request logging | `routes/inbox.js` | Logs IP, size, SHA-256, outcome for every write |
| CSP headers | `server.js` | `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'` |
| Path traversal | `ArtifactService.resolveWithinRoot()` | `path.resolve` + `path.relative` + `startsWith` check |

Tests: `tests/routes/security.test.js` — memory readOnly, path traversal, filename sanitization (special chars, traversal), CORS config verification.

---

## Task 12: Integration Test — Full Portal Flow

**Status:** ✅ Complete

File: `tests/integration/portal.test.js`

Three integration tests:
1. **Full lifecycle**: browse roots → open tree → read doc → search → submit text → verify in queue
2. **Regression**: all existing API endpoints (`/health`, `/status`, `/beads`, `/agents`, `/docs`, `/runs`, `/artifacts/roots`, `/inbox`, SPA fallback) still respond 200
3. **Path traversal**: `../../etc/passwd` returns 400 on artifact doc endpoint

Uses real HTTP server on random port, temp workspace with seeded files, `canListen()` guard for CI environments.

---

## Task 13: Config and Deployment

**Status:** ✅ Complete

### Config fields (in `config.js`)

| Field | Env var | Default | Type |
|-------|---------|---------|------|
| `workspacePath` | `WORKSPACE_PATH` | `~/.openclaw/workspace` | `string` |
| `statePath` | `STATE_PATH` | `$workspacePath/state` | `string` (getter) |
| `inboxPath` | `INBOX_PATH` | `$workspacePath/inbox` | `string` (getter) |
| `maxUploadBytes` | `MAX_UPLOAD_BYTES` | `10485760` (10 MB) | `number` |
| `maxTextBytes` | `MAX_TEXT_BYTES` | `2097152` (2 MB) | `number` |
| `artifactRoots` | `ARTIFACT_ROOTS` | `[$workspacePath]` | `string[]` (getter, CSV-parsed) |
| `beadsCli` | `BEADS_CLI` | `br` | `string` |
| `tmuxCli` | `TMUX_CLI` | `tmux` | `string` |
| `tmuxSocket` | `TMUX_SOCKET` | `/tmp/openclaw-coding-agents.sock` | `string` |
| `port` | `PORT` | `9000` | `number` |
| `nodeEnv` | `NODE_ENV` | `development` | `string` |

All defaults work out of the box — no config changes required to run.

### Deployment

Systemd service at `athena-web.service` and `deployment/systemd/athena-web.service`. Environment file at `/etc/athena-web/env`.

### README

Updated with:
- Portal features (Artifacts, Inbox, Workspace tabs)
- All new API endpoints
- Configuration table with all env vars
- Security notes

### Tests

`tests/config.test.js` — 6 tests covering:
- Default config works out of the box
- Custom config overrides (`INBOX_PATH`, `MAX_UPLOAD_BYTES`, `MAX_TEXT_BYTES`, `ARTIFACT_ROOTS`)
- `inboxPath` derives from `workspacePath` when not overridden
- All required config values present

---

## Summary: All Tasks Complete

| Task | Description | Status | Test count |
|------|-------------|--------|------------|
| 1 | Artifact service | ✅ | 6 |
| 2 | Artifact API routes | ✅ | 7 |
| 3 | Artifact search endpoint | ✅ | 8 |
| 4 | Inbox service | ✅ | 8 |
| 5 | Inbox API routes | ✅ | 5 |
| 6 | Portal page shell | ✅ | — |
| 7 | Artifact browser UI | ✅ | 10 |
| 8 | Inbox UI | ✅ | 4 |
| 9 | File watcher service | ✅ | 5 |
| 10 | Wire SSE to portal UI | ✅ | 1 |
| 11 | Security hardening | ✅ | 5 |
| 12 | Integration test | ✅ | 3 |
| 13 | Config and deployment | ✅ | 6 |

**Total: 224 tests passing, 0 failures.**

---

## File Inventory

### Backend

| File | Purpose |
|------|---------|
| `config.js` | All configuration with env-backed defaults |
| `server.js` | Express app, middleware, route registration, watcher startup |
| `services/artifact-service.js` | Root mapping, tree listing, doc reading, path validation |
| `services/inbox-service.js` | File/text submission, queue listing, atomic writes, SHA-256 |
| `services/artifact-watch-service.js` | Chokidar file watcher with debounced SSE broadcast |
| `services/sse-service.js` | SSE connection management, heartbeat, broadcast |
| `routes/artifacts.js` | `/api/artifacts/*` endpoints (roots, tree, doc, search) |
| `routes/inbox.js` | `/api/inbox/*` endpoints (list, text, upload) with rate limiting |
| `middleware/error-handler.js` | `asyncHandler`, `notFoundHandler`, `errorHandler`, `requestLogger` |

### Frontend

| File | Purpose |
|------|---------|
| `public/js/pages/portal.js` | Portal page with tabbed layout (Artifacts, Inbox, Workspace) |
| `public/js/pages/inbox.js` | Inbox page (drag-drop upload, text submit, queue list) |
| `public/js/pages/artifacts.js` | Redirect stub → Portal |
| `public/js/pages/scrolls.js` | Workspace docs browser (reused as Portal tab) |
| `public/js/api.js` | API client singleton with caching |
| `public/js/sse.js` | SSE client with auto-reconnect |
| `public/js/markdown.js` | Markdown renderer (headings, lists, code, links) |
| `public/js/components.js` | UI component factories |
| `public/js/app.js` | SPA router with hash navigation |
| `public/css/pages.css` | All page-specific styles |
| `public/css/tokens.css` | Design system CSS custom properties |

### Tests

| File | Covers |
|------|--------|
| `tests/services/artifact-service.test.js` | Task 1 |
| `tests/routes/artifacts.test.js` | Task 2 |
| `tests/routes/artifacts-search.test.js` | Task 3 |
| `tests/services/inbox-service.test.js` | Task 4 |
| `tests/routes/inbox.test.js` | Task 5 |
| `tests/frontend/pages/portal.test.js` | Tasks 6–8, 10 |
| `tests/services/artifact-watch-service.test.js` | Task 9 |
| `tests/routes/security.test.js` | Task 11 |
| `tests/integration/portal.test.js` | Task 12 |
| `tests/config.test.js` | Task 13 |

---

## API Reference

### Artifact Endpoints

```
GET /api/artifacts/roots
→ { roots: [{ alias, label, type, readOnly, writable }] }

GET /api/artifacts/tree?root=<alias>&path=<subpath>
→ { root, path, tree: [{ path, type, children? }] }

GET /api/artifacts/doc?root=<alias>&path=<file>
→ { root, path, content, metadata: { mtime, size } }

GET /api/artifacts/search?q=<query>&roots=<csv>&limit=<n>
→ { results: [{ root, path, line, snippet }] }
```

### Inbox Endpoints

```
GET /api/inbox
→ { items: [{ name, filename, size, created, status, metadata }] }

GET /api/inbox/list?status=incoming|processing|done|failed
→ { items: [...] }

POST /api/inbox/text
Body: { title, text, format: "md"|"txt" }
→ { saved: true, id, status, filename, metadata }

POST /api/inbox/upload
Body: multipart/form-data with field "file"
→ { saved: true, id, status, filename, metadata }
```

### SSE Event Types

```
artifact_update → { source, root, eventType, file, ts }
inbox_update    → { source, root, eventType, file, ts }
```
