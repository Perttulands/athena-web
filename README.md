# 🏛️ Athena Web — The Portal

![Banner](banner.jpg)


_Where all the threads become visible._

---

Athena was the goddess of weaving, among other things. This is her web — literally. A mobile-first dashboard where you can see every agent, every bead of work, every document, and every run across the entire Agora. One screen to watch the loom.

Athena Web is an SPA + Express API for monitoring and controlling AI coding agents. No build step, no framework churn, no webpack config that's older than your dependencies. Vanilla JS, vanilla CSS, server-sent events for real-time updates. It loads fast and stays out of your way.

## What You Can Do

| View | Purpose |
|------|---------|
| **Oracle** | Live system status, activity feed, agent progress |
| **Beads** | Work tracker — filter, sort, drill into details, see linked runs |
| **Agents** | Live agent monitor — watch output, kill stuck sessions |
| **Scrolls** | Documentation browser — read, edit, save markdown docs |
| **Chronicle** | Run history with filters and verification details |
| **Portal** | Three-panel workspace: Artifacts browser, Inbox, Docs |

The Portal's **Artifacts** panel deserves a mention — it lets you browse research reports, PRDs, memory files, and results with full-text search. Hit `/` to search. It's the closest thing to Athena's actual memory you can browse with your hands.

## Stack

- **Backend:** Node.js + Express 5
- **Frontend:** Vanilla JS/CSS (no build step, no bundler)
- **Real-time:** Server-Sent Events (`/api/stream`)
- **PWA:** Manifest + service worker + offline fallback
- **Deployment:** systemd + nginx

## Quick Start

```bash
git clone https://github.com/Perttulands/athena-web.git
cd athena-web
npm install
npm run dev
```

Open `http://localhost:9000`. That's it. No build step.

## Test

```bash
npm test
```

224 tests. They all pass.

## API

The API is RESTful and predictable:

```
GET  /api/health              # Health check
GET  /api/status              # System status
GET  /api/beads               # Work items
GET  /api/agents              # Running agents
GET  /api/agents/:name/output # Agent output stream
POST /api/agents/:name/kill   # Kill an agent
GET  /api/docs                # Documentation tree
GET  /api/docs/:path          # Read a document
PUT  /api/docs/:path          # Update a document
GET  /api/runs                # Run history
GET  /api/stream              # SSE event stream
GET  /api/artifacts/roots     # Artifact directories
GET  /api/artifacts/tree      # File tree for a root
GET  /api/artifacts/doc       # Read an artifact
GET  /api/artifacts/search    # Full-text search
GET  /api/inbox               # Inbox status
GET  /api/inbox/list          # List submissions
POST /api/inbox/text          # Submit text
POST /api/inbox/upload        # Upload a file
```

## Configuration

All settings have sensible defaults. Override via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKSPACE_PATH` | `~/athena` | Root workspace directory |
| `INBOX_PATH` | `$WORKSPACE_PATH/inbox` | Inbox submission directory |
| `ARTIFACT_ROOTS` | `$WORKSPACE_PATH` | Comma-separated paths for artifact scanning |
| `MAX_UPLOAD_BYTES` | `10485760` (10 MB) | Max file upload size |
| `MAX_TEXT_BYTES` | `2097152` (2 MB) | Max text submission size |
| `PORT` | `9000` | Server port |
| `NODE_ENV` | `development` | Environment |

## Security

- Path traversal blocked on all file-serving routes
- Agent kill/output routes validate session names
- Markdown rendering escapes HTML (no injection)
- CSP + security headers set in Express and nginx

## Project Layout

```
server.js           # Express app entry
routes/             # API routes
services/           # Backend domain logic
middleware/         # Error handling, performance, security
public/             # SPA — JS, CSS, page modules, PWA assets
deployment/         # nginx, systemd, deployment scripts
tests/              # Backend, frontend, and integration suites
```

## Part of [Athena's Agora](https://github.com/Perttulands/athena-workspace)

Athena Web is the visual layer of the Agora — an autonomous coding system built around AI agents. See the [mythology](https://github.com/Perttulands/athena-workspace/blob/main/mythology.md) for the full story.

## License

MIT
