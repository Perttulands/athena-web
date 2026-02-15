# PRD: Athena Portal — Phase 2

Extend athena-web from swarm dashboard into Perttu's portal to Athena's filesystem intelligence. Existing Oracle/Beads/Agents/Chronicle pages stay untouched.

**Stack:** Node.js + Express, vanilla HTML/CSS/JS, no build step
**Port:** 9000 (systemd service)
**Test:** `node --test "tests/**/*.test.js"`

## Constraints

- All existing tests must pass throughout (190+ tests)
- No new frameworks. Stdlib + Express + existing deps only. Exception: `chokidar` for file watching, `multer` for uploads.
- No breaking changes to existing API endpoints or hash routes
- TDD: write test, then implement, then verify
- `memory/` is read-only — never writable from the web UI
- Path traversal protection on all file-serving endpoints

---

## Phase 1: Artifact Service Backend

- [x] **Task 1: Artifact service — root mapping and tree listing**
- File: `services/artifact-service.js`, `tests/services/artifact-service.test.js`
- ArtifactService class with configurable root aliases:
  - `research` → `<workspace>/docs/research`
  - `results` → `<workspace>/state/results`
  - `prds` → repo roots filtered by `PRD_*.md`
  - `memory` → `<workspace>/memory` (read-only flag)
- Methods: `listRoots()`, `getTree(root, subpath)`, `readDoc(root, path)`
- Strict path validation: resolve + startsWith check, reject `..` traversal
- Reuse patterns from existing `services/docs-service.js`
- Test: root listing, tree enumeration, doc read, path traversal blocked, unknown root rejected
- Verify: `node --test "tests/services/artifact-service.test.js"`

- [x] **Task 2: Artifact API routes**
- File: `routes/artifacts.js`, `tests/routes/artifacts.test.js`
- `GET /api/artifacts/roots` → root aliases with labels and read/write flags
- `GET /api/artifacts/tree?root=<alias>&path=<subpath>` → directory listing
- `GET /api/artifacts/doc?root=<alias>&path=<file>` → markdown content + metadata (mtime, size)
- Register in `server.js` without touching existing routes
- Test: each endpoint, invalid root 404, path traversal 400, missing file 404
- Verify: `node --test "tests/routes/artifacts.test.js"`

- [x] **Task 3: Artifact search endpoint**
- File: `routes/artifacts.js` (extend), `tests/routes/artifacts-search.test.js`
- `GET /api/artifacts/search?q=<query>&roots=<csv>&limit=<n>`
- Uses `rg` (ripgrep) subprocess scoped to allowlisted roots only
- Returns: `[{root, path, line, snippet}]`
- Sanitize query to prevent shell injection (no shell: true, use spawn with args array)
- Test: search finds content, empty results, shell injection blocked, invalid root rejected
- Verify: `node --test "tests/routes/artifacts-search.test.js"`

## Phase 2: Inbox System

- [x] **Task 4: Inbox service — file and text submission**
- File: `services/inbox-service.js`, `tests/services/inbox-service.test.js`
- Config: `inboxPath` (default `~/.openclaw/workspace/inbox`), subdirs: `incoming/`, `processing/`, `done/`, `failed/`
- `submitFile(file, metadata)` → atomic write (.tmp → rename) + `.meta.json` sidecar
- `submitText(title, text, format)` → write markdown/text file + metadata sidecar
- `list(status)` → enumerate files in status subdir with metadata
- Metadata: id, source (upload|text), created_at, original_filename, content_type, size_bytes, sha256
- Size limit: configurable (default 25MB files, 2MB text)
- Test: file submit, text submit, list by status, size limit enforced, atomic write (no partial files)
- Verify: `node --test "tests/services/inbox-service.test.js"`

- [x] **Task 5: Inbox API routes**
- File: `routes/inbox.js`, `tests/routes/inbox.test.js`
- `POST /api/inbox/upload` — multipart via multer, calls InboxService.submitFile
- `POST /api/inbox/text` — JSON body `{title, text, format}`, calls InboxService.submitText
- `GET /api/inbox/list?status=incoming` — queue visibility
- Rate limit: max 10 submissions per minute (simple in-memory counter)
- Register in `server.js`
- Test: upload flow, text submit, list, rate limit triggers 429, oversized rejected
- Verify: `node --test "tests/routes/inbox.test.js"`

## Phase 3: Portal Frontend

- [x] **Task 6: Portal page shell — tab navigation**
- File: `public/js/pages/portal.js`, `public/css/pages.css` (extend)
- New hash route `#/portal` (also keep `#/scrolls` as alias)
- Three internal tabs: Artifacts | Inbox | Workspace (existing scrolls content)
- Bottom nav: rename Scrolls label to Portal
- Reuse existing component patterns from `public/js/components.js`
- Mobile-first: tabs stack horizontally, full-width
- Test: route renders, tab switching works, scrolls alias works
- Verify: `node --test "tests/**/*.test.js"` (ensure no regressions)

- [x] **Task 7: Artifact browser UI**
- File: `public/js/pages/portal.js` (extend)
- Left panel: root selector dropdown + file tree (collapsible on mobile)
- Center: markdown reader with heading anchors, code block styling, table rendering
- Use existing CSS tokens (dark theme, gold accents)
- Fetch from `/api/artifacts/tree` and `/api/artifacts/doc`
- Search bar at top → calls `/api/artifacts/search`, displays results with snippets
- Keyboard: `/` focuses search, `Escape` clears
- Test: tree renders, doc loads, search works, empty states shown
- Verify: `node --test "tests/**/*.test.js"`

- [x] **Task 8: Inbox UI**
- File: `public/js/pages/portal.js` (extend)
- Drag-drop zone for file upload + file picker button
- Large textarea for text/code paste with title input + format selector (md/txt)
- Submit button "Send to Athena"
- Queue list below showing submitted items with status badges
- Optimistic UI: show card immediately, update on SSE
- Touch targets 44px+ for mobile
- Test: upload triggers API call, text submit works, queue renders
- Verify: `node --test "tests/**/*.test.js"`

## Phase 4: Real-time Updates

- [ ] **Task 9: File watcher service**
- File: `services/artifact-watch-service.js`, `tests/services/artifact-watch-service.test.js`
- Uses chokidar to watch artifact roots + inbox subdirs
- Debounce: 300ms
- Emits events to existing SSE service (extend `services/sse-service.js`)
- New SSE event types: `artifact_update`, `inbox_update`
- Payload: `{source, root, eventType: "add"|"change"|"unlink", file, ts}`
- Test: file change triggers event, debounce works, watcher cleanup on close
- Verify: `node --test "tests/services/artifact-watch-service.test.js"`

- [ ] **Task 10: Wire SSE to portal UI**
- File: `public/js/pages/portal.js` (extend)
- Listen for `artifact_update` → refresh tree/doc if viewing affected root
- Listen for `inbox_update` → refresh inbox queue
- Visual indicator: brief flash/highlight on updated items
- Test: SSE event triggers UI refresh
- Verify: `node --test "tests/**/*.test.js"`

## Phase 5: Hardening

- [ ] **Task 11: Security hardening**
- Tighten CORS to same-origin only (update existing `cors()` call)
- Ensure `memory/` root rejects all write attempts at API and service layer
- Filename sanitization on inbox uploads (strip special chars, limit length)
- Add request logging for inbox writes (IP, size, hash, outcome)
- Test: CORS rejects cross-origin, memory write attempt returns 403, malicious filename sanitized
- Verify: `node --test "tests/**/*.test.js"`

- [ ] **Task 12: Integration test — full portal flow**
- File: `tests/integration/portal.test.js`
- End-to-end: browse roots → open tree → read doc → search → submit text to inbox → verify in queue
- Regression: verify all existing endpoints still respond correctly
- Test: full lifecycle, no regressions
- Verify: `node --test "tests/**/*.test.js"`

- [ ] **Task 13: Config and deployment**
- File: `config.js` (extend), update `athena-web.service` if needed
- Add config fields: `artifactRoots`, `inboxPath`, `maxUploadBytes`, `maxTextBytes`
- Defaults work out of the box (no config changes required to run)
- Update README with portal features
- Test: default config works, custom config overrides work
- Verify: `node --test "tests/**/*.test.js"`

---

## Verification

```bash
node --test "tests/**/*.test.js"
```

All tests must pass with zero failures. Existing 190+ tests must not regress.
