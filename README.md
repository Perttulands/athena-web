# Athena Web

Athena Web is a mobile-first SPA + Express API for monitoring and controlling AI coding agents.

## Stack

- Backend: Node.js + Express 5
- Frontend: Vanilla JS/CSS (no build step)
- Realtime: SSE (`/api/stream`)
- Deployment: systemd + nginx (port `9000` upstream)
- PWA: manifest + service worker + offline fallback

## Quick Start

```bash
npm install
npm run dev
```

Open: `http://localhost:9000`

## Test

```bash
npm test
```

## Features by View

- Oracle: live status, activity, Ralph progress
- Beads: filter/sort list + detail bottom sheet + linked runs
- Agents: live monitor, output bottom sheet, kill action
- Scrolls: docs tree browser + markdown viewer + edit/save/cancel
- Chronicle: run history, filters, expandable verification details
- Portal: tabbed interface with three panels:
  - **Artifacts**: browse artifact roots (research, results, PRDs, memory), file tree with markdown viewer (headings, tables, anchors), full-text search with `/` keyboard shortcut
  - **Inbox**: submit text (with title and format selector) or upload files, status badges on queued items, live SSE updates on new submissions
  - **Workspace**: docs tree browser

## API

- `GET /api/health`
- `GET /api/status`
- `GET /api/beads`
- `GET /api/agents`
- `GET /api/agents/:name/output`
- `POST /api/agents/:name/kill`
- `GET /api/docs`
- `GET /api/docs/:path`
- `PUT /api/docs/:path`
- `GET /api/runs`
- `GET /api/stream`
- `GET /api/artifacts/roots`
- `GET /api/artifacts/tree?root=<alias>`
- `GET /api/artifacts/doc?root=<alias>&path=<file>`
- `GET /api/artifacts/search?q=<query>`
- `GET /api/inbox`
- `GET /api/inbox/list?status=<status>`
- `POST /api/inbox/text`
- `POST /api/inbox/upload`

## Configuration

All settings have sensible defaults and work out of the box. Override via environment variables or `/etc/athena-web/env`:

| Variable | Default | Description |
| --- | --- | --- |
| `WORKSPACE_PATH` | `~/.openclaw/workspace` | Root workspace directory |
| `INBOX_PATH` | `$WORKSPACE_PATH/inbox` | Inbox submission directory |
| `ARTIFACT_ROOTS` | `$WORKSPACE_PATH` | Comma-separated repo paths for PRD scanning |
| `MAX_UPLOAD_BYTES` | `10485760` (10 MB) | Max file upload size |
| `MAX_TEXT_BYTES` | `2097152` (2 MB) | Max text submission size |
| `PORT` | `9000` | Server port |
| `NODE_ENV` | `development` | Environment (`production` restricts CORS) |

## Security Notes

- Docs API blocks path traversal
- Agent kill/output routes validate session names
- Markdown renderer escapes HTML (no raw HTML injection)
- CSP + security headers are set in Express and nginx

## Deployment (Port 9000)

Deployment assets are prebuilt under `deployment/`.

1. Configure environment:

```bash
sudo mkdir -p /etc/athena-web
sudo cp deployment/env.production /etc/athena-web/env
```

2. Install systemd service:

```bash
sudo cp deployment/systemd/athena-web.service /etc/systemd/system/athena-web.service
sudo systemctl daemon-reload
sudo systemctl enable athena-web
```

3. Install nginx config:

```bash
sudo cp deployment/nginx/athena.local.conf /etc/nginx/sites-available/athena.local.conf
sudo ln -sf /etc/nginx/sites-available/athena.local.conf /etc/nginx/sites-enabled/athena.local.conf
sudo nginx -t
sudo systemctl reload nginx
```

4. Start service:

```bash
sudo systemctl restart athena-web
sudo systemctl status athena-web
```

5. Verify health:

```bash
curl -f http://127.0.0.1:9000/api/health
```

## Project Layout

- `server.js`: Express app entry
- `routes/`: API routes
- `services/`: backend domain logic
- `middleware/`: middleware (error, perf, security)
- `public/`: SPA, CSS, page modules, PWA assets
- `deployment/`: nginx/systemd/scripts/checklists
- `tests/`: backend, frontend, and integration suites
