# Changelog

All notable changes to Athena Web.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [Unreleased]

### Changed
- README: mythology-forward rewrite — reads like discovering characters in a world, spicy standalone voice
- README: "For Agents" section added — install, what-this-is, runtime usage for agent consumers
- `.truthsayer.toml` reverted — rule suppression removed, judge handles context instead

### Added
- CLAUDE.md: changelog ground rule added to agent instructions

## [0.3.0] - 2026-02-18

### Added
- Banner image (`banner.jpg`) and Athena hero visual in README

### Changed
- Hardcoded server paths replaced with env-driven config (cleanup pass)
- Deployment config updated for production environment

### Fixed
- Beads CLI migrated from `br` (beads_rust) back to `br` after `bd` experiment — config stabilised

## [0.2.1] - 2026-02-16

### Added
- Standalone artifacts viewer page (`/artifacts`) with direct path bootstrapping
- Standalone inbox notifications page (`/inbox`) with direct path bootstrapping

### Fixed
- `.gitignore`: logs and state data (`state/runs/`, `state/results/`, `ralph-*.log`) now excluded
- Backend services PATH resolution fixed
- Beads, agents, and artifacts endpoint fixes from smoke tests

## [0.2.0] - 2026-02-15

### Added
- Portal page shell with tab navigation (artifacts / inbox)
- Inbox API routes: list, submit file, submit text, update status
- Inbox service: atomic file writes, sidecar `.meta.json`, status subdirectories
- Artifact search endpoint powered by ripgrep
- Artifact API routes: roots, tree, doc, results list, results detail
- Artifact service: configurable roots (research, results, PRDs, memory), path traversal guard
- File watcher service (`chokidar`) for real-time SSE push on artifact/inbox changes
- Security hardening: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`
- Integration test for full portal flow
- Config and deployment: `systemd` service file, env-driven config for all paths

### Changed
- SSE wired to portal UI for live artifact and inbox updates

## [0.2.0-alpha] - 2026-02-14

### Added
- Playwright browser test infrastructure: 4 specs (home, beads, agents, mobile responsive)
- Health check test (`health.test.js`)
- Ralph progress data synced to dashboard

### Fixed
- Bottom nav fixed positioning and content padding (nav clip bug)
- Test isolation: open handles cleaned up in service tests and frontend tests
- `health.test.js` assertion error when sockets unavailable

## [0.1.1] - 2026-02-13

### Added
- Artifact viewer and inbox portal (initial version)
- Agents page with live agent monitoring (US-024) — tmux session list, last output, context %
- Beads detail view with bottom sheet (US-023)
- Beads page with list view and filters
- Pull-to-refresh and mobile gesture interactions
- Client-side router and page framework (hash-based SPA navigation)
- API client and SSE client modules (`public/js/api.js`, `public/js/sse.js`)
- Component CSS library and design tokens
- Removed unused `currentPage` variable from router

### Fixed
- Hardcoded server paths replaced with env-driven config (`config.js`)
- Backend services PATH, beads/agents/artifacts endpoint fixes, smoke tests

## [0.1.0] - 2026-02-12

### Added
- Express 5 server with health check endpoint (`/api/health`, `/health`)
- Error handling middleware: async wrapper, 404 handler, global error handler, request logger
- Performance middleware: response time, compression headers, gzip, ETag, request timeout, memory monitor
- CORS restricted to same-origin in production
- Beads service and API endpoint (`/api/beads`) — calls `br list --json`, normalises status
- tmux service and agents API endpoints (`/api/agents`) — list, get output, kill session
- Docs service and API endpoints (`/api/docs`)
- Runs service and API endpoints (`/api/runs`)
- Ralph service and API endpoint (`/api/ralph`) — parses PRD checkboxes and progress file
- Status endpoint (`/api/status`) — dashboard aggregate from all services, graceful partial failures
- SSE streaming endpoint (`/api/stream`) — real-time push via Server-Sent Events
- HTML shell, CSS design tokens, reset, and component styles
- `systemd` service file and startup validation
- PWA manifest, service worker, and offline page
