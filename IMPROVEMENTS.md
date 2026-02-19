# 🏛️ IMPROVEMENTS — Dispatches from the Agora

_Five proposals forged in the spirit of Athena: wisdom through engineering._

---

## 1. The Mnemosyne Cache — In-Memory Caching for Status Aggregation

**Problem:** Every `GET /api/status` call (`routes/status.js`) fires four independent async calls — `listBeads()`, `listAgents()`, `runsService.listRuns()`, and `ralphService.getRalphStatus()` — every single time. The beads service shells out to `br --no-db list --json` (`services/beads-service.js:runBeadsList`), and the agents service runs multiple sequential `tmux capture-pane` commands per agent (`services/tmux-service.js:listAgents`). On a busy dashboard with SSE clients polling, this hammers the system with redundant subprocess spawns.

**Implementation:**
- Add a `services/cache-service.js` with a simple TTL cache (Map + timestamp, no dependencies needed).
- Wrap `listBeads()` with a 3-second TTL cache, `listAgents()` with a 5-second TTL (matching the existing 10s SSE poll), and `listRuns()` with a 5-second TTL.
- Invalidate the beads cache on filesystem watch events in `services/sse-service.js:onStateChange`.
- In `routes/status.js`, use `Promise.allSettled()` instead of sequential try/catch blocks, so all four fetches run truly in parallel.

**Expected Impact:** 60-80% reduction in subprocess spawns under load. Status endpoint response time drops from ~200ms to ~20ms on cache hits. The SSE polling loop in `sse-service.js` also benefits since `pollAgentStatus` and `broadcastBeadUpdate` share the same cache.

---

## 2. The Aegis Shield — Authentication & Access Control

**Problem:** There is zero authentication. The `server.js` CORS policy restricts cross-origin in production, and security headers are solid (CSP, X-Frame-Options), but anyone who can reach port 9000 (or the nginx proxy) can kill agents (`POST /api/agents/:name/kill`), write documents (`PUT /api/docs/:path`), and submit to the inbox. The session name validation in `routes/agents.js` prevents injection but not unauthorized access.

**Implementation:**
- Add a `middleware/auth.js` that checks for a Bearer token (from env `ATHENA_API_TOKEN`) on all mutating endpoints (POST, PUT, DELETE).
- For the browser SPA, implement a simple token-in-localStorage flow: `/login` page sets the token, `public/js/api.js` attaches it as an `Authorization` header.
- Read-only GET endpoints remain open (dashboard viewing is harmless).
- Add `ATHENA_API_TOKEN` to `config.js` with a clear warning if unset in production.

**Expected Impact:** Prevents unauthorized agent kills and document mutations. Critical for any scenario where the server is exposed beyond localhost/Tailscale. Minimal code — ~60 lines of middleware + ~30 lines of login UI.

---

## 3. The Oracle's Memory — Persistent Activity Log with SQLite

**Problem:** Recent activity in `routes/status.js` is reconstructed by scanning run JSON files on every request (`services/runs-service.js:listRuns`). There's no persistent activity/audit log. The SSE service tracks `lastRunSignature` in memory only — server restarts lose all state. The `recentActivity` array is capped at 10 items with no way to browse history.

**Implementation:**
- Add `better-sqlite3` as a dependency (zero-config, single-file DB).
- Create `services/activity-log.js` that writes events (agent start/stop/kill, bead transitions, document edits, inbox submissions) to `state/activity.db`.
- Add `GET /api/activity?limit=50&offset=0&type=agent_complete` endpoint in a new `routes/activity.js`.
- Wire into existing SSE broadcast points in `sse-service.js` — each `broadcast()` call also writes to the log.
- Add a Chronicle page enhancement in `public/js/pages/chronicle.js` to query this endpoint with pagination.

**Expected Impact:** Full audit trail survives restarts. Chronicle page becomes a real historical view instead of a snapshot of run files. Enables future analytics (agent success trends, throughput graphs).

---

## 4. The Weaver's Thread — Agent Output Streaming via SSE

**Problem:** The Agents page (`public/js/pages/agents.js`) must poll `GET /api/agents/:name/output` repeatedly to show live agent output. The `tmux-service.js:getOutput` function runs `tmux capture-pane` on every poll — a subprocess per agent per poll interval. There's no streaming endpoint for continuous output.

**Implementation:**
- Add `GET /api/agents/:name/stream` in `routes/agents.js` that opens an SSE connection and tails the tmux pane using `tmux capture-pane` diffs (capture with `-S -50`, diff against previous capture, send only new lines).
- Create a `services/agent-stream-service.js` that maintains one polling loop per watched agent (not per client), broadcasting to all SSE clients subscribed to that agent.
- In `public/js/pages/agents.js`, replace the polling `setInterval` with an `EventSource` connection to `/api/agents/:name/stream`.
- Clean up streams when the agent session ends (detect via `tmux has-session` failure).

**Expected Impact:** Near-real-time agent output display (~1s latency vs current poll intervals). Eliminates N×M subprocess calls (N agents × M poll cycles). The agent monitoring experience goes from "refresh and hope" to true live tailing.

---

## 5. The Pallas Gate — Offline-First PWA with Background Sync

**Problem:** The service worker (`public/sw.js`) exists and there's an `offline.html` fallback, but the PWA is not truly offline-capable. The `manifest.json` is present but the SW likely only caches the shell. API data (beads, status, recent activity) is unavailable offline. On mobile (the stated "mobile-first" design), losing connectivity means a blank dashboard.

**Implementation:**
- Enhance `public/sw.js` with a stale-while-revalidate strategy for API GET endpoints (`/api/status`, `/api/beads`, `/api/runs`). Cache responses in a named Cache API store with 5-minute TTL.
- Add background sync registration in `public/js/api.js` for mutating operations (inbox submissions via `/api/inbox/text` and `/api/inbox/upload`) — queue failed POSTs and replay when online.
- Pre-cache all CSS (`public/css/*.css`), JS (`public/js/**/*.js`), and critical assets (`public/assets/owl.svg`, icons) during SW install.
- Add an "offline" banner component in `public/js/components.js` that shows when `navigator.onLine` is false, styled with the existing design tokens in `public/css/tokens.css`.

**Expected Impact:** Dashboard remains functional on spotty mobile connections. Inbox submissions don't get lost. The "mobile-first" promise in the README becomes real. PWA install experience improves — Lighthouse PWA score should jump to 90+.

---

_"The owl of Athena flies at dusk — but with these upgrades, she flies at wire speed."_ 🦉⚡
