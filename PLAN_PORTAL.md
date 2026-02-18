# PLAN: Athena Portal Expansion (`athena-web`)

## Goal
Evolve `athena-web` from a swarm dashboard into Perttu's primary web interface to Athena's filesystem intelligence, while preserving existing Oracle/Beads/Agents/Chronicle workflows.

As of this plan, backend foundations are strong (`routes/*`, `services/*`, SSE, error middleware), Oracle is mature, Beads is functional, and Scrolls/Agents/Chronicle pages are still partially stubbed. This plan extends rather than rewrites.

## 1. Architecture Changes Needed

### 1.1 Backend Service Layer Additions
Add three new services:

- `services/artifact-service.js`
  - Enumerates, reads, and searches Markdown artifacts from approved roots.
  - Root aliases:
    - `research` -> `<workspace>/docs/research`
    - `results` -> `<workspace>/state/results`
    - `prds` -> `<repo-root>` filtered by `PRD_*.md`
    - `memory` -> `<workspace>/memory` (read-only)
  - Enforces strict path allowlisting and traversal protection.

- `services/inbox-service.js`
  - Handles file uploads and long-text submissions.
  - Writes to configurable inbox root (default: `$HOME/athena/inbox/incoming`).
  - Uses atomic write pattern (`.tmp` then rename), metadata sidecars, size/type validation.

- `services/artifact-watch-service.js`
  - Watches artifact roots + inbox folders and emits SSE updates.
  - Extends current SSE model (currently watching `state/runs` and `state/results`).

### 1.2 Route Layer Additions
Add new route modules:

- `routes/artifacts.js`
- `routes/inbox.js`

Register in `server.js` without touching existing route contracts.

### 1.3 Config Additions (`config.js`)
Add explicit portal paths and limits:

- `artifactRoots` map (resolved absolute paths)
- `inboxPath` (default `$HOME/athena/inbox`)
- `maxUploadBytes` (e.g. `25 * 1024 * 1024`)
- `maxTextBytes` (e.g. `2 * 1024 * 1024`)
- `allowedUploadExtensions` (configurable allowlist)

### 1.4 Dependencies
Minimal additions:

- `multer` (multipart upload parsing)
- `chokidar` (robust recursive file watching)

Optional (phase 2, if richer Markdown needed):

- `marked` + HTML sanitizer strategy (or keep custom minimal renderer + strict escaping)

### 1.5 Preserve Existing Runtime Contracts
Do not break:

- Existing API endpoints (`/api/status`, `/api/beads`, `/api/agents`, etc.)
- Existing hash routes (`#/oracle`, `#/beads`, `#/agents`, `#/scrolls`, `#/chronicle`)
- Existing SSE event names (additive events only)

## 2. New Routes and Pages

### 2.1 Backend API (New)

#### Artifact APIs
- `GET /api/artifacts/roots`
  - Returns root aliases, labels, read/write flags.

- `GET /api/artifacts/tree?root=<alias>&path=<optional-subpath>`
  - Returns directory tree scoped to root.

- `GET /api/artifacts/doc?root=<alias>&path=<file>`
  - Returns markdown content + metadata (`mtime`, `size`, `title`, `headings`).

- `GET /api/artifacts/search?q=<query>&roots=<csv>&limit=<n>`
  - Full-text search across configured roots (first release can be ripgrep-backed).

- `GET /api/artifacts/recent?root=<alias>&limit=<n>`
  - Recently changed artifacts for quick browsing.

#### Inbox APIs
- `POST /api/inbox/upload`
  - Multipart file upload; stores file + `.meta.json` sidecar.

- `POST /api/inbox/text`
  - JSON body `{ title, text, format }`; writes `.md` or `.txt` into inbox.

- `GET /api/inbox/list?status=<incoming|processing|done|failed>`
  - Returns queue visibility for submitted items.

### 2.2 SSE Events (New, Additive)
- `artifact_update` (file add/change/delete in watched artifact roots)
- `inbox_update` (new inbox submission, status transition)

### 2.3 Frontend Routes/Pages

#### Recommended route strategy
Keep 5-tab bottom nav and evolve `Scrolls` into the portal surface:

- `#/scrolls` -> Artifact Portal page (rename UI label to `Portal`)
- Within page, internal tabs:
  - `Artifacts` (reader/search)
  - `Inbox` (upload/paste)
  - `Workspace` (existing doc tree/edit mode preserved)

Backward compatibility:
- `#/scrolls` remains valid hash route.

Optional explicit aliases:
- `#/portal` (same module as `#/scrolls`)
- `#/inbox` deep-link to Inbox tab

## 3. File Watching / Inbox System Design

### 3.1 Inbox Directory Contract
Under `inboxPath`:

- `incoming/` (web app writes here)
- `processing/` (Athena moves when picked up)
- `done/` (processed)
- `failed/` (rejected/errored)

For each submission:
- Payload file: `<timestamp>_<slug>_<shortid>.<ext>`
- Metadata file: same basename + `.meta.json`

Metadata schema:
- `id`, `source` (`upload|text`), `created_at`, `original_filename`, `content_type`, `size_bytes`, `sha256`, `author` (optional), `notes` (optional)

### 3.2 Atomic Write and Validation Flow
1. Validate request size/type.
2. Write to temp file in same filesystem.
3. Compute hash + metadata.
4. Rename temp to final path.
5. Emit `inbox_update` SSE event.

### 3.3 Watcher Design
- Use `chokidar` to watch:
  - artifact roots (`research`, `results`, `prds`, `memory`)
  - inbox state folders (`incoming`, `processing`, `done`, `failed`)
- Debounce rapid events (e.g. 300-500ms).
- Publish normalized SSE payload:
  - `{ source, root, eventType, file, ts }`

### 3.4 Search Strategy
Phase 1:
- On-demand search using `rg` through allowlisted roots.

Phase 2:
- Optional in-memory index updated by watcher events for faster ranked search/snippets.

## 4. Security Considerations (Tailscale-Only Access)

### 4.1 Network Model
Requirement: reachable at `http://athena:9000`.

Implementation:
- Keep Node listening on port 9000 (already default).
- Ensure host resolves in Tailscale MagicDNS as `athena`.
- Restrict port exposure to Tailscale interface only via firewall.

Suggested host/network steps:
1. `sudo tailscale set --hostname=athena`
2. Confirm: `tailscale status` and `ping athena`
3. Firewall:
   - allow `tailscale0` -> tcp/9000
   - deny public interface -> tcp/9000

### 4.2 App-Layer Hardening
- Tighten CORS (current `cors()` is permissive): same-origin only.
- Keep all artifact paths behind root alias allowlist.
- Mark `memory` and `prds` as read-only in API.
- Upload allowlist + max size + filename sanitization.
- No direct shelling with untrusted user path inputs.
- Escape or sanitize Markdown-rendered HTML.
- Add rate limit middleware for inbox endpoints.

### 4.3 Auditability
- Log inbox writes with request IP, filesize, hash, outcome.
- Log rejected uploads/path violations with explicit reasons.

## 5. UI/UX Approach

### 5.1 Artifact Rendering Experience
Design target: clean reading portal, not raw textarea/doc dump.

Artifact page sections:
- Left/Top: source selector + searchable file tree
- Center: reading view with typographic markdown styles
- Right/Bottom drawer: outline (H1/H2/H3), metadata, quick actions

Reader capabilities:
- Heading anchor links
- ToC jump navigation
- Code block styling + horizontal scroll
- Tables/checklists rendering
- Keyboard shortcuts (`/` search, `j/k` next/prev doc, `[`/`]` history)

### 5.2 Search and Discovery
- Global artifact search bar across selected roots.
- Filters: source root, date range, filename pattern.
- Results include context snippet + highlighted term + source badge.

### 5.3 Upload/Paste UX
Inbox tab:
- Drag/drop area for files
- File picker button
- Large text/code paste box with title + format selector
- Submit actions:
  - `Send to Athena` (primary)
  - `Save as draft` (optional)

Feedback:
- Optimistic queue card + progress + final stored path/id.
- Clear failure reasons (size limit, invalid type, write failure).

### 5.4 Mobile-first Behavior
- Bottom nav unchanged footprint.
- Artifact tree collapses into slide-over drawer.
- Reader is single-column with sticky top actions.
- Inbox controls use full-width touch targets (44px+).

## 6. Sprint-Level Breakdown with Estimates

Assumption: 1 engineer, no major infra blockers.

### Sprint 1 (2-3 days): Backend Foundations
- Add `artifact-service` with root mapping + safe read/tree/list.
- Add `inbox-service` with atomic writes + metadata.
- Add new routes and register endpoints.
- Unit tests for path safety, upload/text submit, root filtering.

Estimate: 16-24 hours.

### Sprint 2 (2-3 days): Artifact Viewer UI
- Evolve `scrolls.js` into portal shell (Artifacts/Inbox/Workspace tabs).
- Implement file tree + markdown reader + metadata panel.
- Integrate `/api/artifacts/*` calls and loading/empty/error states.
- Frontend tests for navigation and rendering.

Estimate: 16-24 hours.

### Sprint 3 (1-2 days): Search + Watch + SSE
- Add `artifact-search` endpoint (ripgrep-backed).
- Add watcher service and emit `artifact_update` + `inbox_update`.
- Wire live refresh in portal UI.

Estimate: 8-16 hours.

### Sprint 4 (1-2 days): Inbox UX Completion
- Implement multipart upload + paste submission UI.
- Queue/status list wired to `/api/inbox/list`.
- Retry/delete affordances (if desired).
- Add endpoint-level rate limits and stricter validation.

Estimate: 8-16 hours.

### Sprint 5 (1 day): Tailscale Access + Ops Hardening
- Validate `athena:9000` end-to-end.
- Update service/deployment docs for direct-port access mode.
- Firewall + CORS + production config verification.

Estimate: 6-8 hours.

### Sprint 6 (1-2 days): Regression + Integration
- Regression pass across Oracle/Beads/Agents/Chronicle.
- Add integration tests for portal browse/search/upload flow.
- Fixes, polish, and final docs.

Estimate: 8-16 hours.

Total estimate: 62-104 engineering hours (about 8-13 working days).

## 7. What Can Be Reused From Existing Code

### Backend Reuse
- `services/docs-service.js`
  - Existing secure path validation + tree/read/write patterns.
  - Use as base for root-scoped artifact reads.

- `services/sse-service.js`
  - Existing client set management, heartbeat, and watcher lifecycle.
  - Extend with artifact/inbox watcher sources.

- `middleware/error-handler.js`
  - Reuse `asyncHandler` and consistent JSON errors.

- `middleware/performance.js`
  - Reuse request timeout/ETag behavior for new APIs.

### Frontend Reuse
- `public/js/api.js`
  - Continue as central API wrapper.

- `public/js/components.js`
  - Reuse cards, badges, skeletons, dialogs, toasts for portal + inbox UX.

- `public/css/tokens.css`, `public/css/components.css`, `public/css/pages.css`
  - Reuse visual system and extend with artifact-reader styles.

- `public/js/app.js`
  - Keep hash SPA model; add route aliasing, avoid framework migration.

### Deployment Reuse
- Existing systemd/ops scripts and health checks.
- Existing Tailscale-oriented deployment docs as baseline; add direct `:9000` mode.

## Implementation Notes / Non-Goals

- Non-goal for first release: full WYSIWYG editor, collaborative editing, auth beyond Tailscale.
- Keep write scope narrow: uploads/text only to inbox path, not arbitrary filesystem writes.
- Keep `memory/` strictly read-only in UI and API.
- Keep existing dashboard feature behavior unchanged.

## Acceptance Criteria

- Portal browses and renders markdown from all required roots:
  - `docs/research/`
  - `state/results/`
  - `PRD_*.md`
  - `memory/` (read-only)
- Global search across artifact roots works with usable snippets.
- Upload and long-text submit both produce inbox files Athena can monitor.
- SSE notifies portal clients of new artifacts/inbox changes.
- App reachable at `http://athena:9000` over Tailscale.
- Existing Oracle/Beads/Agents/Chronicle flows continue to work.
