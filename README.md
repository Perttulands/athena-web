# 🏛️ Athena Web — The Loom Room

![Banner](banner.jpg)

_Where all the threads become visible._

---

Deep in the Agora, there's a vast room with a great loom at its center. Threads glow in different colours — gold for open work, blue for in progress, green for done, red for blocked. Glass and bronze beads are strung on each thread. Where threads split and merge, you can see the git branches. A golden thread runs from the loom to Athena's wrist, connected to every piece of work in progress.

This is that room, rendered in vanilla JS and Express. Athena was the goddess of weaving, among other things. This is her web — literally. A mobile-first dashboard where you can see every agent, every bead of work, every document, and every run across the entire Agora. One screen to watch the loom.

No build step, no framework churn, no webpack config that's older than your dependencies. It loads fast and stays out of your way.

## How It Works

| View | Purpose |
|------|---------|
| **Oracle** | Live system status, activity feed, agent progress |
| **Beads** | Work tracker — filter, sort, drill into details, see linked runs |
| **Agents** | Live agent monitor — watch output, kill stuck sessions |
| **Scrolls** | Documentation browser — read, edit, save markdown docs |
| **Chronicle** | Run history with filters and verification details |
| **Portal** | Three-panel workspace: Artifacts browser, Inbox, Docs |

The Portal's **Artifacts** panel lets you browse research reports, PRDs, memory files, and results with full-text search. Hit `/` to search. It's the closest thing to Athena's actual memory you can browse with your hands.

## Install

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

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKSPACE_PATH` | `~/athena` | Root workspace directory |
| `INBOX_PATH` | `$WORKSPACE_PATH/inbox` | Inbox submission directory |
| `ARTIFACT_ROOTS` | `$WORKSPACE_PATH` | Comma-separated paths for artifact scanning |
| `MAX_UPLOAD_BYTES` | `10485760` (10 MB) | Max file upload size |
| `MAX_TEXT_BYTES` | `2097152` (2 MB) | Max text submission size |
| `PORT` | `9000` | Server port |
| `NODE_ENV` | `development` | Environment |

## Stack

- **Backend:** Node.js + Express 5
- **Frontend:** Vanilla JS/CSS (no build step, no bundler)
- **Real-time:** Server-Sent Events (`/api/stream`)
- **PWA:** Manifest + service worker + offline fallback
- **Deployment:** systemd + nginx

## Security

- Path traversal blocked on all file-serving routes
- Agent kill/output routes validate session names
- Markdown rendering escapes HTML (no injection)
- CSP + security headers set in Express and nginx

## For Agents

This repo includes `AGENTS.md`. Your agent knows what to do.

```bash
cd /home/perttu/athena-web
npm install
```

Dependencies: Node.js 18+, npm. No build step. No bundler. No webpack config to debug at 3am.

## 🏛️ Part of the Agora

Athena Web was forged in **[Athena's Agora](https://github.com/Perttulands/athena-workspace)** — the autonomous coding system where marble meets circuit board.

This is the Loom Room — where you stand to see the whole tapestry. Every other tool in the Agora feeds data here: [Argus](https://github.com/Perttulands/argus) reports health, [Relay](https://github.com/Perttulands/relay) carries messages, [Oathkeeper](https://github.com/Perttulands/oathkeeper) tracks promises, [Truthsayer](https://github.com/Perttulands/truthsayer) enforces quality. The Loom shows it all.

Read the [mythology](https://github.com/Perttulands/athena-workspace/blob/main/mythology.md) if you want the full story.

## License

MIT
