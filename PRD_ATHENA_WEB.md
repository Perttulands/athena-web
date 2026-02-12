# PRD: Athena Web — The Temple

> *"Athena didn't fight every battle herself — she appeared at the critical moment, whispered strategy to the warrior, tipped the scales."*

## Overview

Athena Web is the personal command interface for an AI goddess of wisdom who orchestrates a swarm of coding agents. It is Perttu's window into the swarm — a mobile-first webapp that feels like consulting an oracle. Ancient Greek aesthetic meets modern minimal design. Dark theme. Gold accents. The owl is the mark.

**Port:** 9000
**Stack:** Node.js + Express backend, vanilla HTML/CSS/JS frontend (no build step)
**Data:** Filesystem reads (beads CLI, tmux, state/ JSON), SSE for real-time
**Process:** systemd service on $HOSTNAME

---

## Design System

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-deep` | `#1a1a2e` | Primary background |
| `--bg-surface` | `#16213e` | Card backgrounds |
| `--bg-elevated` | `#1f2b47` | Hover states, active cards |
| `--gold` | `#d4a574` | Accents, highlights, active states, borders |
| `--gold-bright` | `#e8c07a` | Hover on gold elements |
| `--text-primary` | `#e8e0d0` | Body text (cream/off-white) |
| `--text-secondary` | `#a09888` | Muted text, timestamps |
| `--text-dim` | `#6a6258` | Disabled, placeholder |
| `--success` | `#7ec89b` | Done, passed, healthy |
| `--danger` | `#e07676` | Failed, error, kill buttons |
| `--warning` | `#d4a574` | Active, in-progress (shares gold) |
| `--info` | `#7a9ec8` | Info badges, context % |

### Typography
- **Headers:** Playfair Display (serif) via Google Fonts
- **Body/Data:** Inter (sans-serif) via Google Fonts
- **Monospace:** JetBrains Mono (code, agent output)
- Scale: 12 / 14 / 16 / 20 / 24 / 32 / 40px

### Decorative Elements
- Greek meander (key pattern) as decorative borders on header, section dividers
- Subtle marble texture on header area (CSS gradient or tiny repeating SVG)
- Owl icon in header (text emoji or SVG)
- Cards with `backdrop-filter: blur(10px)` and slight transparency
- Micro-animations: 200ms fade-ins on page transitions, subtle scale on card hover

### Mobile-First Breakpoints
- **Mobile:** 0–768px (primary design target)
- **Tablet:** 769–1024px
- **Desktop:** 1025px+

---

## Architecture

```
athena-web/
├── server.js                  # Express entry point
├── package.json
├── config.js                  # Environment & paths config
├── middleware/
│   └── error-handler.js       # Global error handling
├── routes/
│   ├── status.js              # GET /api/status
│   ├── beads.js               # GET /api/beads
│   ├── agents.js              # GET/POST /api/agents/*
│   ├── docs.js                # GET/PUT /api/docs/*
│   ├── runs.js                # GET /api/runs
│   ├── ralph.js               # GET /api/ralph
│   └── stream.js              # GET /api/stream (SSE)
├── services/
│   ├── beads-service.js       # br CLI integration
│   ├── tmux-service.js        # tmux session queries
│   ├── docs-service.js        # Filesystem doc reader/writer
│   ├── runs-service.js        # state/runs/ + state/results/ reader
│   ├── ralph-service.js       # PRD checkbox parser + progress reader
│   └── sse-service.js         # SSE event broadcasting
├── public/
│   ├── index.html             # SPA shell
│   ├── css/
│   │   ├── reset.css          # CSS reset
│   │   ├── tokens.css         # CSS custom properties
│   │   ├── base.css           # Typography, layout primitives
│   │   ├── components.css     # Cards, badges, buttons, nav
│   │   └── pages.css          # Page-specific styles
│   ├── js/
│   │   ├── app.js             # Router, page loader, init
│   │   ├── api.js             # Fetch wrapper, error handling
│   │   ├── sse.js             # SSE client, reconnection
│   │   ├── components.js      # Reusable UI components
│   │   └── pages/
│   │       ├── oracle.js      # Dashboard view
│   │       ├── beads.js       # Beads view
│   │       ├── agents.js      # Agents view
│   │       ├── scrolls.js     # Docs view
│   │       └── chronicle.js   # Logs view
│   └── assets/
│       ├── owl.svg            # Owl icon
│       └── marble-texture.svg # Subtle marble pattern
├── tests/
│   ├── routes/
│   │   ├── status.test.js
│   │   ├── beads.test.js
│   │   ├── agents.test.js
│   │   ├── docs.test.js
│   │   ├── runs.test.js
│   │   ├── ralph.test.js
│   │   └── stream.test.js
│   ├── services/
│   │   ├── beads-service.test.js
│   │   ├── tmux-service.test.js
│   │   ├── docs-service.test.js
│   │   ├── runs-service.test.js
│   │   ├── ralph-service.test.js
│   │   └── sse-service.test.js
│   └── setup.js               # Test helpers, mocks
├── athena-web.service          # systemd unit file
└── PRD_ATHENA_WEB.md           # This file
```

---

## API Specification

### GET /api/status
Dashboard aggregate data.
```json
{
  "athena": {
    "status": "watching",
    "lastMessage": "All agents completed. 3/3 beads closed.",
    "lastSeen": "2026-02-12T10:30:00Z"
  },
  "agents": {
    "running": 2,
    "total": 5,
    "successRate": 0.87
  },
  "beads": {
    "todo": 4,
    "active": 2,
    "done": 31,
    "failed": 1
  },
  "ralph": {
    "currentTask": "US-003",
    "iteration": 2,
    "maxIterations": 5,
    "prdProgress": { "done": 8, "total": 15 }
  },
  "recentActivity": [
    { "time": "...", "type": "agent_complete", "message": "Agent bd-279 completed (lint: pass, tests: pass)" }
  ]
}
```

### GET /api/beads
```json
[{
  "id": "bd-279",
  "title": "Add retry logic to dispatch",
  "status": "done",
  "priority": 1,
  "created": "2026-02-12T08:00:00Z",
  "updated": "2026-02-12T09:30:00Z"
}]
```
Query params: `?status=active&priority=1&sort=updated`

### GET /api/agents
```json
[{
  "name": "agent-bd-279",
  "bead": "bd-279",
  "status": "running",
  "startedAt": "2026-02-12T10:00:00Z",
  "runningTime": "12m",
  "lastOutput": "Running tests... 42/42 passed",
  "contextPercent": 67
}]
```

### GET /api/agents/:name/output
Returns last 200 lines of tmux capture for the named session.
```json
{
  "name": "agent-bd-279",
  "output": "...",
  "lines": 200
}
```

### POST /api/agents/:name/kill
Kills the tmux session. Returns `{ "killed": true, "name": "agent-bd-279" }`.

### GET /api/docs
Returns file tree of workspace docs.
```json
{
  "tree": [
    { "path": "VISION.md", "type": "file" },
    { "path": "docs/", "type": "dir", "children": [...] }
  ]
}
```

### GET /api/docs/:path
Returns `{ "path": "VISION.md", "content": "# VISION.md..." }`.

### PUT /api/docs/:path
Body: `{ "content": "..." }`. Returns `{ "saved": true, "path": "..." }`.
Path restricted to workspace directory. No `..` traversal.

### GET /api/runs
```json
[{
  "bead": "bd-279",
  "agent": "claude",
  "model": "sonnet",
  "started_at": "...",
  "finished_at": "...",
  "exit_code": 0,
  "attempt": 1,
  "verification": { "lint": "pass", "tests": "pass", "ubs": "clean" }
}]
```
Query params: `?status=success&date=2026-02-12&agent=claude`

### GET /api/ralph
```json
{
  "prd": "PRD_SOMETHING.md",
  "tasks": [
    { "id": "US-001", "title": "Setup project", "done": true },
    { "id": "US-002", "title": "Add auth", "done": false }
  ],
  "currentIteration": 2,
  "maxIterations": 5,
  "activeTask": "US-003"
}
```

### GET /api/stream (SSE)
Event types:
- `agent_status` — agent started/completed/failed
- `bead_update` — bead status changed
- `ralph_progress` — ralph iteration advanced
- `activity` — general activity event

---

## Sprint Plan

---

### Sprint 1: Backend Foundation

> *"Before there was a temple, there was a foundation of stone."*

Goal: Working Express server with all API endpoints returning real data. Tests for every route. systemd service file.

---

- [x] **US-001** Project initialization and Express server setup

  **Scope:** Initialize npm project, install dependencies (express, cors), create `server.js` entry point, `config.js` for environment variables and paths, basic health check at `GET /api/health`. Server listens on port 9000.

  **Config values:** workspace path (`~/.openclaw/workspace`), state path (`~/.openclaw/workspace/state`), beads CLI path (`br`), port (9000).

  **TDD Phases:**
  - **RED:** Write test that `GET /api/health` returns `{ status: "ok" }` with 200. Write test that server loads config from environment. Tests fail (no server exists).
  - **GREEN:** Create `package.json` with express, cors, dotenv. Create `config.js`. Create `server.js` with health endpoint. Tests pass.
  - **VERIFY:** `npm test` passes. `node server.js` starts and `curl localhost:9000/api/health` returns OK.

  **Files:** `package.json`, `server.js`, `config.js`, `tests/setup.js`, `tests/routes/health.test.js`

---

- [x] **US-002** Error handling middleware and API utilities

  **Scope:** Global error handler middleware that catches async errors and returns JSON `{ error: message, status: code }`. Async route wrapper to avoid try/catch in every handler. 404 handler for undefined API routes. Request logging middleware (minimal — method, path, status, duration).

  **TDD Phases:**
  - **RED:** Write test that unknown route returns 404 JSON. Write test that throwing in a route returns 500 JSON with error message. Write test that async errors are caught.
  - **GREEN:** Create `middleware/error-handler.js` with 404 handler, global error handler, async wrapper. Wire into `server.js`.
  - **VERIFY:** `npm test` passes. Manual test: `curl localhost:9000/api/nonexistent` returns `{"error":"Not found","status":404}`.

  **Files:** `middleware/error-handler.js`, `server.js` (update), `tests/routes/error-handler.test.js`

---

- [x] **US-003** Beads service and API endpoint

  **Scope:** Service that calls `br list --json` and parses output. Route `GET /api/beads` with query params for filtering (`status`, `priority`, `sort`). Handle CLI not found gracefully (return empty array + warning). Parse bead fields: id, title, status, priority, created, updated.

  **TDD Phases:**
  - **RED:** Write tests for `beads-service.js`: mock `child_process.exec` to return sample `br list --json` output, verify parsing. Test filtering by status. Test graceful handling when `br` is not found. Write route test for `GET /api/beads`.
  - **GREEN:** Create `services/beads-service.js` with `listBeads(filters)`. Create `routes/beads.js`. Register in `server.js`.
  - **VERIFY:** `npm test` passes. If `br` is installed, `curl localhost:9000/api/beads` returns real bead data.

  **Files:** `services/beads-service.js`, `routes/beads.js`, `tests/services/beads-service.test.js`, `tests/routes/beads.test.js`

---

- [x] **US-004** Tmux service and agents API endpoints

  **Scope:** Service that queries tmux for sessions prefixed with `agent-`. For each session: capture last N lines of output, calculate running time, detect if alive. Routes: `GET /api/agents` (list all), `GET /api/agents/:name/output` (full recent output), `POST /api/agents/:name/kill` (kill session with tmux kill-session).

  **Commands used:**
  - `tmux list-sessions -F "#{session_name} #{session_created}"` — list sessions
  - `tmux capture-pane -t <name> -p -S -50` — last 50 lines (list endpoint)
  - `tmux capture-pane -t <name> -p -S -200` — last 200 lines (detail endpoint)
  - `tmux kill-session -t <name>` — kill

  **TDD Phases:**
  - **RED:** Write tests for `tmux-service.js`: mock exec calls, verify session parsing, output capture, kill. Route tests for all three endpoints. Test that kill returns 404 for nonexistent session.
  - **GREEN:** Create `services/tmux-service.js` with `listAgents()`, `getOutput(name, lines)`, `killAgent(name)`. Create `routes/agents.js`. Register.
  - **VERIFY:** `npm test` passes. If tmux sessions exist, `curl localhost:9000/api/agents` returns data.

  **Files:** `services/tmux-service.js`, `routes/agents.js`, `tests/services/tmux-service.test.js`, `tests/routes/agents.test.js`

---

- [ ] **US-005** Docs service and API endpoints

  **Scope:** Service that reads the workspace docs directory tree. Returns nested file/dir structure. Reads individual files as markdown text. Writes files (with path validation — must be within workspace, no `..` traversal). Routes: `GET /api/docs` (tree), `GET /api/docs/:path(*)` (read), `PUT /api/docs/:path(*)` (write).

  **Security:** Validate all paths resolve within workspace root. Reject any path containing `..` or resolving outside workspace.

  **TDD Phases:**
  - **RED:** Tests for `docs-service.js`: mock filesystem, verify tree building, file reading, file writing. Test path traversal rejection. Route tests for all three endpoints.
  - **GREEN:** Create `services/docs-service.js` with `getTree()`, `readDoc(path)`, `writeDoc(path, content)`. Create `routes/docs.js`. Register.
  - **VERIFY:** `npm test` passes. `curl localhost:9000/api/docs` returns workspace tree.

  **Files:** `services/docs-service.js`, `routes/docs.js`, `tests/services/docs-service.test.js`, `tests/routes/docs.test.js`

---

- [ ] **US-006** Runs service and API endpoint

  **Scope:** Service that reads `state/runs/*.json` and `state/results/*.json` files. Merges run + result by bead ID. Routes: `GET /api/runs` with query params (`status`, `date`, `agent`). Sort by most recent first.

  **Graceful degradation:** If state directories don't exist, return empty array. If individual JSON files are malformed, skip them and log warning.

  **TDD Phases:**
  - **RED:** Tests for `runs-service.js`: create temp directory with sample JSON files, verify reading and merging. Test filtering. Test missing directory handling. Test malformed JSON handling. Route test.
  - **GREEN:** Create `services/runs-service.js` with `listRuns(filters)`. Create `routes/runs.js`. Register.
  - **VERIFY:** `npm test` passes.

  **Files:** `services/runs-service.js`, `routes/runs.js`, `tests/services/runs-service.test.js`, `tests/routes/runs.test.js`

---

- [ ] **US-007** Ralph service and API endpoint

  **Scope:** Service that parses a PRD markdown file for checkbox tasks (`- [ ]` / `- [x]`) and reads a progress file (`progress_*.txt`) for current iteration info. Route: `GET /api/ralph`.

  **Parsing logic:**
  - Find lines matching `- \[([ x])\] \*\*US-\d+\*\*` — extract ID, title, done status
  - Read progress file for `current_task`, `iteration`, `max_iterations` fields

  **TDD Phases:**
  - **RED:** Tests for `ralph-service.js`: provide sample PRD markdown, verify task extraction. Test progress file parsing. Test missing files. Route test.
  - **GREEN:** Create `services/ralph-service.js` with `getRalphStatus()`. Create `routes/ralph.js`. Register.
  - **VERIFY:** `npm test` passes.

  **Files:** `services/ralph-service.js`, `routes/ralph.js`, `tests/services/ralph-service.test.js`, `tests/routes/ralph.test.js`

---

- [ ] **US-008** Status endpoint (dashboard aggregate)

  **Scope:** Route `GET /api/status` that aggregates data from beads, agents, runs, and ralph services into a single dashboard payload. Includes recent activity (last 10 events from runs, sorted by time). Calls each service and assembles response. Any service failure returns partial data with warnings, never crashes.

  **TDD Phases:**
  - **RED:** Write route test that mocks all services, verifies assembled response shape. Test partial failure (one service throws, others still returned).
  - **GREEN:** Create `routes/status.js` that imports and calls each service. Register.
  - **VERIFY:** `npm test` passes. `curl localhost:9000/api/status` returns aggregate data.

  **Files:** `routes/status.js`, `tests/routes/status.test.js`

---

- [ ] **US-009** SSE streaming endpoint

  **Scope:** Create `services/sse-service.js` as an event emitter singleton. Route `GET /api/stream` sets up SSE connection with proper headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`). Heartbeat every 30s to keep connection alive. Clients receive events as they're emitted. Service exposes `broadcast(type, data)` method used by other routes/services.

  **Reconnection:** Client-side will handle reconnection. Server just needs clean disconnect handling (remove listener on close).

  **TDD Phases:**
  - **RED:** Test SSE service: broadcast emits to listeners, listener removal on disconnect. Test route: verify correct headers, verify events received.
  - **GREEN:** Create `services/sse-service.js` with `addClient(res)`, `removeClient(res)`, `broadcast(type, data)`. Create `routes/stream.js`. Register.
  - **VERIFY:** `npm test` passes. Manual: `curl -N localhost:9000/api/stream` receives heartbeat events.

  **Files:** `services/sse-service.js`, `routes/stream.js`, `tests/services/sse-service.test.js`, `tests/routes/stream.test.js`

---

- [ ] **US-010** systemd service file and startup validation

  **Scope:** Create `athena-web.service` systemd unit file. Runs as user `perttu`. Working directory is the project root. Starts with `node server.js`. Restarts on failure. Environment file for config overrides. Write install/uninstall instructions in a comment block at top of the service file.

  **TDD Phases:**
  - **RED:** Write test that validates the service file exists and contains required directives (ExecStart, WorkingDirectory, Restart, User).
  - **GREEN:** Create `athena-web.service` with proper systemd config.
  - **VERIFY:** Test passes. `systemd-analyze verify athena-web.service` has no errors (if available). Document install steps.

  **Files:** `athena-web.service`, `tests/systemd.test.js`

---

**Sprint 1 Review Gate:**
- All tests pass (`npm test`)
- Every API endpoint returns valid JSON
- Server starts cleanly on port 9000
- `curl` each endpoint and verify response shape
- systemd service file validated

---

### Sprint 2: Frontend Foundation

> *"The columns rise. The proportions are perfect. The temple takes shape."*

Goal: Complete HTML/CSS foundation with the design system implemented. Navigation works. Pages load (empty shells). Mobile-first layout is solid.

---

- [ ] **US-011** HTML shell and CSS design tokens

  **Scope:** Create `public/index.html` as SPA shell. Include Google Fonts (Playfair Display, Inter, JetBrains Mono). Meta viewport for mobile. Create `css/reset.css` (minimal CSS reset). Create `css/tokens.css` with all CSS custom properties from design system. Create `css/base.css` with typography scale, body styling, layout primitives (container, flex utilities, grid).

  **HTML structure:**
  ```html
  <header> <!-- owl + "Athena" + status indicator --> </header>
  <main id="app"> <!-- page content injected here --> </main>
  <nav id="bottom-nav"> <!-- mobile bottom navigation --> </nav>
  ```

  **TDD Phases:**
  - **RED:** No automated tests for pure CSS — instead, create a `test-tokens.html` visual test page that displays all colors, typography, spacing as swatches. Open in browser to verify.
  - **GREEN:** Create all CSS files and HTML shell. Serve via Express static middleware.
  - **VERIFY:** Open `localhost:9000` in mobile viewport (375px). Visual inspection: dark background, gold accents visible, fonts loaded, bottom nav positioned correctly.

  **Files:** `public/index.html`, `public/css/reset.css`, `public/css/tokens.css`, `public/css/base.css`, `server.js` (add static middleware)

---

- [ ] **US-012** Component CSS library

  **Scope:** Create `css/components.css` with reusable component styles:
  - **Cards:** translucent backgrounds, gold border on hover, rounded corners, backdrop-blur
  - **Badges:** status badges (running=gold, done=green, failed=red, todo=dim)
  - **Buttons:** primary (gold), danger (red), ghost (transparent with border)
  - **Bottom nav:** fixed bottom, 5 icon+label items, active state with gold underline
  - **Header:** marble texture background, owl icon, app title, status dot
  - **Lists:** clean list items with timestamps, dividers
  - **Meander border:** CSS-only Greek key pattern as decorative element
  - **Pull-to-refresh:** indicator styling (spinner or owl animation)
  - **Loading skeleton:** pulsing placeholder cards for loading states

  **TDD Phases:**
  - **RED:** Create a `test-components.html` page that showcases every component in every state. Visual test page.
  - **GREEN:** Implement all component styles. Each component is a CSS class that can be applied to semantic HTML.
  - **VERIFY:** Open test page in mobile viewport. Every component renders correctly. No horizontal overflow. Touch targets are 44px minimum.

  **Files:** `public/css/components.css`

---

- [ ] **US-013** Client-side router and page framework

  **Scope:** Create `js/app.js` with hash-based SPA router. Routes: `#/oracle` (default), `#/beads`, `#/agents`, `#/scrolls`, `#/chronicle`. Router loads the corresponding page module, calls its `render()` function to inject HTML into `#app`. Bottom nav highlights active page. Page transition: fade-out old, fade-in new (200ms CSS transition).

  **Navigation items (bottom bar):**
  1. Oracle (dashboard icon / temple icon)
  2. Beads (circle icon)
  3. Agents (users icon)
  4. Scrolls (scroll/book icon)
  5. Chronicle (clock icon)

  Icons: use simple SVG inline icons or Unicode symbols. No icon library dependency.

  **TDD Phases:**
  - **RED:** Write test that router maps hash to correct page module. Test that navigating updates `#app` innerHTML. Test active nav state.
  - **GREEN:** Create `js/app.js` with router. Create page stub files in `js/pages/` that export `render()` returning placeholder HTML. Wire bottom nav click handlers.
  - **VERIFY:** Tests pass. Navigate between pages in browser — content changes, nav highlights, URL hash updates. Works on mobile.

  **Files:** `public/js/app.js`, `public/js/pages/oracle.js`, `public/js/pages/beads.js`, `public/js/pages/agents.js`, `public/js/pages/scrolls.js`, `public/js/pages/chronicle.js`, `tests/frontend/router.test.js`

---

- [ ] **US-014** API client and SSE client modules

  **Scope:** Create `js/api.js` — thin fetch wrapper. All API calls go through it. Handles errors uniformly (shows toast or inline error). Methods: `api.get(path)`, `api.post(path, body)`, `api.put(path, body)`. Base URL auto-detected.

  Create `js/sse.js` — SSE client that connects to `/api/stream`. Auto-reconnects on disconnect (exponential backoff: 1s, 2s, 4s, max 30s). Exposes `sse.on(eventType, callback)` for pages to subscribe. Connection status indicator in header (green dot = connected, red = disconnected).

  **TDD Phases:**
  - **RED:** Test api.js: mock fetch, verify correct URL construction, error handling. Test sse.js: mock EventSource, verify event dispatching, reconnection logic.
  - **GREEN:** Implement both modules.
  - **VERIFY:** Tests pass. In browser: SSE connects (green dot in header), API calls work against running server.

  **Files:** `public/js/api.js`, `public/js/sse.js`, `tests/frontend/api.test.js`, `tests/frontend/sse.test.js`

---

- [ ] **US-015** Reusable UI component library (JS)

  **Scope:** Create `js/components.js` with factory functions for common UI elements:
  - `createCard({ title, body, status, footer })` — returns card DOM element
  - `createBadge(status)` — returns colored status badge
  - `createActivityItem({ time, type, message })` — returns activity feed item
  - `createStatBox({ label, value, trend })` — returns stat display element
  - `createLoadingSkeleton(type)` — returns loading placeholder
  - `createConfirmDialog({ title, message, onConfirm })` — returns modal dialog
  - `createToast({ message, type })` — shows temporary notification

  All components return DOM elements (not HTML strings) for security and testability.

  **TDD Phases:**
  - **RED:** Write tests for each component function: verify returned element structure, classes, content.
  - **GREEN:** Implement all component functions.
  - **VERIFY:** Tests pass. Visual verification on test page.

  **Files:** `public/js/components.js`, `tests/frontend/components.test.js`

---

- [ ] **US-016** Page-specific CSS and responsive layout

  **Scope:** Create `css/pages.css` with styles specific to each page view:
  - **Oracle:** stat grid (2x2 on mobile, 4-across on desktop), activity feed, agent status cards
  - **Beads:** list/kanban layout, filter bar, bead detail sheet (bottom sheet on mobile)
  - **Agents:** agent cards with output preview, full-output sheet
  - **Scrolls:** sidebar tree (collapsible on mobile), markdown content area, edit mode
  - **Chronicle:** filterable table/list, expandable run details

  All layouts mobile-first. Grid/flexbox. No horizontal scroll.

  **TDD Phases:**
  - **RED:** Create visual test pages for each layout with dummy content. Verify in mobile and desktop viewports.
  - **GREEN:** Implement all page-specific CSS.
  - **VERIFY:** Visual inspection at 375px, 768px, 1024px viewports. No overflow. Touch targets adequate.

  **Files:** `public/css/pages.css`

---

**Sprint 2 Review Gate:**
- All CSS renders correctly at mobile, tablet, desktop widths
- Navigation works between all 5 pages
- SSE connection indicator shows in header
- Loading skeletons display while data fetches
- No JavaScript errors in console
- Google Fonts load correctly
- Meander border decorations visible
- Touch targets minimum 44px

---

### Sprint 3: Dashboard & Real-Time

> *"The oracle speaks. The temple comes alive."*

Goal: The Oracle (dashboard) page is fully functional with live data. SSE pushes real-time updates. Pull-to-refresh works.

---

- [ ] **US-017** Oracle page — stat cards and layout

  **Scope:** Implement `js/pages/oracle.js` fully. On load, fetch `/api/status`. Display:
  - **Header section:** Athena's last message in a styled quote block, with timestamp
  - **Stat grid (2x2 mobile):** Agents running, Beads active, Success rate, Ralph progress
  - Each stat card shows value prominently (large number) with label below
  - Stat cards use appropriate colors (gold for active counts, green for success rate)

  **TDD Phases:**
  - **RED:** Test that oracle.render() fetches `/api/status`. Test that stat cards are created with correct values from mock data. Test loading skeleton shows before data arrives.
  - **GREEN:** Implement oracle page with real API calls and DOM rendering.
  - **VERIFY:** Tests pass. Open in browser — stat cards show real data from server. Loading state visible briefly.

  **Files:** `public/js/pages/oracle.js`, `tests/frontend/pages/oracle.test.js`

---

- [ ] **US-018** Oracle page — agent status cards and activity feed

  **Scope:** Below the stat grid on Oracle page:
  - **Active agents section:** Card per running agent showing name, bead ID, running time, last output line (truncated), context % as colored bar. Tap card to navigate to Agents page.
  - **Recent activity feed:** Last 10 events in a timeline-style list. Each item: timestamp, type icon, message. Types: agent_complete (green), agent_failed (red), bead_created (gold), ralph_step (blue).

  **TDD Phases:**
  - **RED:** Test agent cards render from mock status data. Test activity feed renders correct number of items with proper styling. Test tap on agent card navigates to `#/agents`.
  - **GREEN:** Add agent cards and activity feed sections to oracle.js.
  - **VERIFY:** Tests pass. Visual: agent cards show live data, activity feed scrolls, tapping works.

  **Files:** `public/js/pages/oracle.js` (extend), `tests/frontend/pages/oracle.test.js` (extend)

---

- [ ] **US-019** Oracle page — Ralph progress display

  **Scope:** Ralph section on Oracle page:
  - **Progress bar:** Visual bar showing PRD completion (X of Y tasks done). Gold fill.
  - **Current task highlight:** Show which US task is active, iteration X of Y.
  - **Task checklist preview:** Show next 3 upcoming tasks from PRD, with checkboxes (visual only, not interactive).

  Fetch from `/api/ralph`. Handle missing/empty data gracefully (show "No active Ralph loop" message).

  **TDD Phases:**
  - **RED:** Test Ralph section renders progress bar with correct width. Test current task displays. Test empty state message.
  - **GREEN:** Add Ralph section to oracle.js.
  - **VERIFY:** Tests pass. Visual: progress bar fills correctly, current task highlighted.

  **Files:** `public/js/pages/oracle.js` (extend), `tests/frontend/pages/oracle.test.js` (extend)

---

- [ ] **US-020** SSE integration — live dashboard updates

  **Scope:** Wire SSE events to update the Oracle page in real-time without full refresh:
  - `agent_status` event → update agent cards (add/remove/update status)
  - `bead_update` event → update stat cards
  - `ralph_progress` event → update progress bar and current task
  - `activity` event → prepend to activity feed (remove oldest if >10)

  DOM updates are surgical (update specific elements, no full re-render). Connection status dot in header reflects SSE state.

  **Backend enhancement:** Have services emit SSE events when data changes. Add filesystem watchers on `state/runs/` and `state/results/` directories to trigger events. Poll tmux every 10s for agent status changes.

  **TDD Phases:**
  - **RED:** Test that SSE events trigger correct DOM updates on oracle page. Test that new activity items prepend correctly. Backend: test that file watcher triggers SSE broadcast.
  - **GREEN:** Wire SSE handlers in oracle.js. Add file watchers and tmux polling in backend SSE service.
  - **VERIFY:** Tests pass. Open two browser tabs — kill an agent in one, see update in other. File change in state/ triggers event.

  **Files:** `public/js/pages/oracle.js` (extend), `public/js/sse.js` (extend), `services/sse-service.js` (extend file watchers), `tests/frontend/pages/oracle-sse.test.js`, `tests/services/sse-service.test.js` (extend)

---

- [ ] **US-021** Pull-to-refresh and mobile interactions

  **Scope:** Implement pull-to-refresh on the Oracle page (and establish pattern for other pages):
  - Touch start tracking at top of scroll
  - Pull down > 60px triggers refresh
  - Show owl spinner animation during refresh
  - Fetch fresh data from `/api/status` and re-render
  - Haptic feedback via `navigator.vibrate(10)` if available

  Also: add swipe-left on agent cards to reveal quick-kill button. Swipe gesture detection utility.

  **TDD Phases:**
  - **RED:** Test pull-to-refresh: simulate touch events, verify refresh triggered. Test swipe gesture detection. Test that refresh calls API and updates display.
  - **GREEN:** Implement touch gesture utilities. Add pull-to-refresh to oracle page. Add swipe on agent cards.
  - **VERIFY:** Tests pass. On mobile (or mobile emulator): pull down refreshes, swipe on agent card reveals kill button.

  **Files:** `public/js/gestures.js`, `public/js/pages/oracle.js` (extend), `public/css/components.css` (pull-to-refresh styles), `tests/frontend/gestures.test.js`

---

**Sprint 3 Review Gate:**
- Oracle page displays all sections with real data
- SSE connection live — updates appear in real-time
- Pull-to-refresh works on mobile
- Swipe gestures work on agent cards
- Loading states display correctly
- Empty states display correctly (no agents, no ralph loop)
- Performance: page loads in <1s on mobile network

---

### Sprint 4: Feature Views

> *"Each chamber of the temple serves its purpose."*

Goal: All five views fully functional with real data.

---

- [ ] **US-022** Beads page — list view with filters

  **Scope:** Implement `js/pages/beads.js`:
  - **Filter bar (top):** Status tabs (All / Todo / Active / Done / Failed) — sticky on scroll
  - **Bead list:** Each bead as a card showing: title, ID (small), status badge, priority indicator (colored dot), timestamps
  - **Sort:** By updated (default), created, priority
  - **Count:** Show count per status in the tab labels ("Active (3)")
  - Fetch from `/api/beads` with query params based on active filter

  **TDD Phases:**
  - **RED:** Test beads page renders list from mock data. Test filter tabs update displayed beads. Test sort changes order. Test count labels.
  - **GREEN:** Implement beads page.
  - **VERIFY:** Tests pass. Real bead data displays. Filters work. Smooth scroll.

  **Files:** `public/js/pages/beads.js`, `tests/frontend/pages/beads.test.js`

---

- [ ] **US-023** Beads page — detail view (bottom sheet)

  **Scope:** Tap a bead card to open a detail bottom sheet (mobile pattern — slides up from bottom):
  - Full title, ID, status badge
  - Timestamps: created, updated
  - Priority with label
  - Linked run records (if any) — fetch from `/api/runs?bead=<id>` and show as mini-cards
  - Close by swiping down or tapping backdrop

  **Bottom sheet component:** Reusable. Slides up with CSS transform. Backdrop darkens. Traps scroll within sheet. Swipe-down-to-close gesture.

  **TDD Phases:**
  - **RED:** Test bottom sheet component: opens, closes, traps scroll. Test bead detail content from mock data. Test linked runs display.
  - **GREEN:** Create bottom sheet component. Implement bead detail content.
  - **VERIFY:** Tests pass. Tap bead → sheet slides up with details. Swipe down closes. Smooth animation.

  **Files:** `public/js/components.js` (add bottom sheet), `public/js/pages/beads.js` (extend), `public/css/components.css` (bottom sheet styles), `tests/frontend/pages/beads-detail.test.js`

---

- [ ] **US-024** Agents page — live agent monitor

  **Scope:** Implement `js/pages/agents.js`:
  - **Agent cards:** Each card shows: session name, bead ID link, status indicator (green pulse = running, gray = stopped), running time (live counter), last 3 lines of output (monospace, truncated), context % as horizontal bar.
  - **Empty state:** "No agents running. The swarm rests." with owl illustration.
  - **Auto-refresh:** SSE updates agent cards in real-time.
  - Cards sorted: running first, then by start time.

  **TDD Phases:**
  - **RED:** Test agent cards render from mock data. Test running time updates. Test empty state. Test SSE updates modify cards.
  - **GREEN:** Implement agents page.
  - **VERIFY:** Tests pass. Agent cards show real tmux session data. Running time ticks. SSE updates work.

  **Files:** `public/js/pages/agents.js`, `tests/frontend/pages/agents.test.js`

---

- [ ] **US-025** Agents page — output view and kill action

  **Scope:** Tap agent card to expand full output view:
  - Full-screen overlay (or bottom sheet) with monospace output
  - Last 200 lines from `/api/agents/:name/output`
  - Auto-scroll to bottom
  - **Kill button:** Red, bottom of output view. Tap → confirm dialog → `POST /api/agents/:name/kill` → close sheet, remove card.
  - Output auto-updates if SSE sends new output events

  **TDD Phases:**
  - **RED:** Test output view fetches and displays output. Test auto-scroll. Test kill button shows confirm dialog. Test kill API call and card removal.
  - **GREEN:** Implement output view and kill flow.
  - **VERIFY:** Tests pass. View real agent output. Kill button works (test with a dummy tmux session).

  **Files:** `public/js/pages/agents.js` (extend), `tests/frontend/pages/agents-output.test.js`

---

- [ ] **US-026** Scrolls page — document browser with tree navigation

  **Scope:** Implement `js/pages/scrolls.js`:
  - **Left panel (collapsible on mobile):** File tree from `/api/docs`. Directories expandable. Files clickable.
  - **Main panel:** Rendered markdown content. Use a lightweight markdown-to-HTML renderer (write a minimal one or include marked.js via CDN).
  - **Mobile layout:** Tree as collapsible menu at top. Content below. Hamburger toggle for tree.
  - Current file path shown as breadcrumb.

  **TDD Phases:**
  - **RED:** Test tree renders from mock file tree data. Test file click fetches and displays content. Test directory expand/collapse. Test mobile tree toggle.
  - **GREEN:** Implement scrolls page with tree navigation and markdown rendering.
  - **VERIFY:** Tests pass. Browse real workspace docs. Markdown renders correctly. Mobile layout works.

  **Files:** `public/js/pages/scrolls.js`, `public/js/markdown.js` (minimal renderer or CDN include), `tests/frontend/pages/scrolls.test.js`

---

- [ ] **US-027** Scrolls page — edit mode

  **Scope:** Add edit capability to the Scrolls page:
  - **Edit button:** Top-right of content area. Toggles between view and edit mode.
  - **Edit mode:** Textarea with monospace font, full width/height. Tab inserts spaces. Ctrl/Cmd+S saves.
  - **Save:** `PUT /api/docs/:path` with textarea content. Show success toast. Return to view mode.
  - **Cancel:** Discard changes, return to view mode. If content changed, show confirm dialog.
  - **Mobile:** Edit mode is full-screen. Save and cancel buttons prominent at top.

  **TDD Phases:**
  - **RED:** Test edit button toggles mode. Test save calls API with content. Test cancel with unsaved changes shows confirm. Test keyboard shortcut.
  - **GREEN:** Implement edit mode.
  - **VERIFY:** Tests pass. Edit a real doc, save, verify file changed on disk. Cancel preserves original.

  **Files:** `public/js/pages/scrolls.js` (extend), `tests/frontend/pages/scrolls-edit.test.js`

---

- [ ] **US-028** Chronicle page — run history with filters

  **Scope:** Implement `js/pages/chronicle.js`:
  - **Filter bar:** Date picker (native input), status filter (all/success/failed), agent type filter
  - **Run list:** Each run as an expandable card:
    - Collapsed: bead ID, agent, model, status badge, duration, timestamp
    - Expanded: full verification results (lint/tests/ubs), attempt number, prompt hash
  - **Stats summary:** At top — total runs, success rate, avg duration. Fetched from run data.
  - Sort: most recent first.

  **TDD Phases:**
  - **RED:** Test chronicle page renders run list from mock data. Test filters narrow results. Test card expand/collapse. Test stats calculation.
  - **GREEN:** Implement chronicle page.
  - **VERIFY:** Tests pass. Real run data displays. Filters work. Cards expand.

  **Files:** `public/js/pages/chronicle.js`, `tests/frontend/pages/chronicle.test.js`

---

**Sprint 4 Review Gate:**
- All 5 pages fully functional with real data
- Beads: filter, sort, detail bottom sheet all work
- Agents: live status, output view, kill button all work
- Scrolls: browse, read, edit docs all work
- Chronicle: filter, expand run details all work
- SSE updates work on every page that needs them
- No console errors
- All tests pass

---

### Sprint 5: Polish & Mobile

> *"The artisans arrive. Gold leaf on every surface. The temple is consecrated."*

Goal: Production-ready. PWA. Animations. Performance. The experience is divine.

---

- [ ] **US-029** Micro-animations and transitions

  **Scope:** Add polish animations throughout:
  - **Page transitions:** Crossfade between pages (opacity 0→1, 200ms ease)
  - **Card hover:** Subtle scale (1.01) and gold border glow on desktop hover
  - **Card appear:** Staggered fade-in when list loads (each card 50ms delay)
  - **Stat number count-up:** Numbers animate from 0 to value on load (300ms)
  - **Status badge pulse:** Running status badges have subtle pulse animation
  - **Bottom sheet:** Smooth spring-like slide animation (CSS cubic-bezier)
  - **Owl spinner:** Subtle rotation animation for loading/refresh states
  - **Meander border:** Subtle shimmer effect on gold meander patterns

  **Respect `prefers-reduced-motion`:** All animations disabled when user prefers reduced motion.

  **TDD Phases:**
  - **RED:** Test that animations are disabled when `prefers-reduced-motion` is set. Test stagger delay calculation.
  - **GREEN:** Implement all animations in CSS and JS.
  - **VERIFY:** Tests pass. Visual: animations smooth at 60fps. Reduced motion respected.

  **Files:** `public/css/animations.css` (new), `public/js/animations.js`, `public/css/components.css` (update), `tests/frontend/animations.test.js`

---

- [ ] **US-030** PWA setup (manifest, service worker, icons)

  **Scope:** Make Athena Web installable as a PWA:
  - **manifest.json:** App name "Athena", theme color (midnight blue), background color (deep charcoal), display standalone, start_url "/", icons at 192px and 512px.
  - **Service worker:** Cache-first for static assets (CSS, JS, fonts). Network-first for API calls. Offline fallback page ("Athena is offline. The owl watches patiently.").
  - **Icons:** Generate owl icon at required sizes (can be simple SVG-based).
  - **Meta tags:** apple-mobile-web-app-capable, theme-color, apple-touch-icon.
  - **Install prompt:** Subtle banner on first visit suggesting "Add to Home Screen".

  **TDD Phases:**
  - **RED:** Test manifest.json is valid and served correctly. Test service worker registers. Test offline fallback page loads when network unavailable.
  - **GREEN:** Create manifest, service worker, icons, offline page. Add meta tags to HTML.
  - **VERIFY:** Tests pass. Chrome DevTools → Application → Manifest shows valid config. Lighthouse PWA audit passes. Installable on iPhone.

  **Files:** `public/manifest.json`, `public/sw.js`, `public/offline.html`, `public/assets/icon-192.svg`, `public/assets/icon-512.svg`, `public/index.html` (update meta tags), `tests/frontend/pwa.test.js`

---

- [ ] **US-031** Performance optimization

  **Scope:** Ensure the temple loads fast:
  - **CSS concatenation:** Single `<link>` in production (concatenate all CSS files during serve, or use a simple build script)
  - **JS lazy loading:** Page modules loaded on demand, not upfront. Use dynamic `import()`.
  - **Font optimization:** `font-display: swap` on all Google Fonts. Preconnect to fonts.googleapis.com.
  - **Image optimization:** SVG icons inline where possible. Marble texture as CSS gradient fallback.
  - **API response caching:** Short TTL (5s) client-side cache for repeated API calls during navigation.
  - **Gzip:** Enable compression middleware in Express.
  - **Bundle size:** Total JS < 50KB. Total CSS < 30KB. No dependencies larger than 20KB.

  **TDD Phases:**
  - **RED:** Test that gzip is enabled (response headers). Test client cache works (second call returns cached). Test that page modules load lazily.
  - **GREEN:** Add compression middleware. Implement client-side cache in api.js. Add font preconnect. Lazy-load page modules.
  - **VERIFY:** Tests pass. Lighthouse performance score > 90. First contentful paint < 1.5s on throttled 3G.

  **Files:** `server.js` (compression), `public/js/api.js` (caching), `public/js/app.js` (lazy loading), `public/index.html` (preconnect), `tests/frontend/performance.test.js`

---

- [ ] **US-032** Owl SVG icon and marble texture assets

  **Scope:** Create the visual identity assets:
  - **Owl SVG:** Minimalist geometric owl in gold (#d4a574). Used in header, loading spinner, empty states, PWA icon. Must look sharp at 24px and 512px.
  - **Marble texture:** Subtle, repeating SVG pattern or CSS gradient. Very faint — background detail, not decoration. Applied to header area.
  - **Meander border:** CSS-only Greek key pattern. Gold lines on dark background. Used as horizontal rule and card accents.
  - **Favicon:** Owl icon as favicon (SVG favicon with fallback).

  **TDD Phases:**
  - **RED:** Test that owl SVG file exists and is valid XML. Test favicon is referenced in HTML.
  - **GREEN:** Create SVG assets. Implement meander border in CSS. Add favicon.
  - **VERIFY:** Tests pass. Visual: owl crisp at all sizes, marble subtle, meander clean.

  **Files:** `public/assets/owl.svg`, `public/assets/marble-texture.svg`, `public/css/components.css` (meander), `public/index.html` (favicon)

---

- [ ] **US-033** Accessibility and final UX polish

  **Scope:** Ensure the temple is accessible:
  - **ARIA labels:** All interactive elements have aria-labels. Nav items have aria-current. Live regions for SSE updates.
  - **Keyboard navigation:** Tab through all interactive elements. Enter/Space activate. Escape closes sheets/dialogs.
  - **Focus management:** On page transition, focus moves to main content. Bottom sheet traps focus.
  - **Color contrast:** Verify all text/bg combinations meet WCAG AA (4.5:1 for body, 3:1 for large text).
  - **Screen reader:** Test with screen reader. Activity feed has aria-live="polite".
  - **Error states:** All API failures show user-friendly error messages, not raw errors.
  - **Empty states:** Every list has a meaningful empty state message with personality.

  **TDD Phases:**
  - **RED:** Test ARIA labels present on nav, buttons, badges. Test keyboard navigation (tab order, escape closes). Test focus management on page transition.
  - **GREEN:** Add all accessibility attributes and behaviors.
  - **VERIFY:** Tests pass. axe-core audit has no violations. Keyboard-only navigation works fully. Color contrast verified.

  **Files:** `public/index.html` (ARIA), `public/js/app.js` (focus management), `public/js/components.js` (ARIA), `public/css/base.css` (focus styles), `tests/frontend/accessibility.test.js`

---

- [ ] **US-034** Integration testing and production readiness

  **Scope:** Final validation:
  - **Integration tests:** End-to-end test that starts server, navigates all pages, verifies data displays. Uses real API calls (with test data directory).
  - **Mobile device testing:** Document test results on iPhone Safari, Chrome Android.
  - **systemd deployment test:** Install service, verify start/stop/restart, verify auto-restart on crash.
  - **Security review:** Verify path traversal protection in docs API. Verify no XSS vectors in markdown rendering. Verify kill endpoint validates session names. CSP headers.
  - **README:** Update with setup instructions, architecture overview, screenshots.

  **TDD Phases:**
  - **RED:** Write integration test suite that starts the server and exercises all pages and API endpoints.
  - **GREEN:** Fix any issues found. Add CSP headers. Finalize README.
  - **VERIFY:** All tests pass including integration. Server runs stable under systemd for 1 hour. No memory leaks (track RSS over time).

  **Files:** `tests/integration/full-flow.test.js`, `README.md`, `server.js` (CSP headers)

---

**Sprint 5 Review Gate:**
- Lighthouse scores: Performance > 90, Accessibility > 95, PWA passes
- All animations smooth, respects reduced-motion
- PWA installable on iPhone and Android
- Service worker caches correctly, offline page works
- All accessibility checks pass (axe-core, keyboard, screen reader)
- Security: no XSS, no path traversal, CSP headers set
- systemd service stable
- Total bundle: JS < 50KB, CSS < 30KB
- README complete with setup instructions

---

## Definition of Done

A user story is complete when:
1. All tests pass (`npm test`)
2. Code follows the established patterns in the codebase
3. No console errors or warnings in browser
4. Works on mobile viewport (375px wide)
5. Changes committed with descriptive message
6. Accessible (keyboard navigable, ARIA labels on interactive elements)

## Non-Functional Requirements

- **Response time:** API endpoints < 200ms. Page transitions < 300ms.
- **Memory:** Server RSS < 100MB under normal operation.
- **Uptime:** systemd auto-restarts. Service recovers from crashes within 5s.
- **Security:** Path traversal protection. Input sanitization. CSP headers. No eval(). DOM creation over innerHTML where user data is displayed.
- **Browser support:** Latest Safari (iOS), Chrome (Android), Firefox, Chrome (desktop).

## Risk Register

| Risk | Mitigation |
|------|-----------|
| `br` CLI not installed or different output format | Graceful degradation — return empty data with warning |
| tmux not running or no agent sessions | Empty states with meaningful messages |
| State directory doesn't exist yet | Auto-create on first access or return empty |
| Large number of beads/runs (1000+) | Pagination on API endpoints (limit/offset) |
| SSE connection instability | Exponential backoff reconnection, data-refresh on reconnect |
| Markdown rendering XSS | Sanitize rendered HTML, CSP headers |

---

*The temple stands. The owl watches. Wisdom flows.*
