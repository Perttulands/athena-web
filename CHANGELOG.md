# Changelog

All notable changes to Athena Web.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [Unreleased]

### Added
- Cache service layer with TTL-based in-memory cache, request deduplication, and cache stats endpoint (AW-001)
- Parallel status fetch: `/api/status` now uses `Promise.allSettled` with cache for all data sources (AW-002)
- Graceful shutdown: SIGTERM/SIGINT handlers close HTTP server, SSE clients, and file watchers cleanly (AW-003)
- SSE reconnection: exponential backoff with jitter, visibility-aware reconnect, and reconnect banner (AW-004)
- Stability test suite: cache-under-load, SSE client stress, and graceful shutdown export tests (AW-005)
- Tapestry data model and `/api/tapestry` endpoint: beads grouped by status, colored and sized by priority (AW-010)
- Timeline view and `/api/timeline` endpoint: run history with duration, day grouping, and success stats (AW-011)
- Health dashboard and `/api/health-dashboard` endpoint: process metrics, service checks, cache stats (AW-012)

### Changed
- README: mythology-forward rewrite — each README now reads like discovering a character in a world

### Added
- "For Agents" section in README: install, what-this-is, and runtime usage for agent consumers

### Planned
- UX redesign (Sprint 5): 10 user stories, beads backlog as star feature, mobile-first, agent monitoring improvements

### Added
- Playwright browser tests: 4 specs (home, beads, agents, mobile responsive) in `tests/browser/`

## [0.2.0] - 2026-02-13

### Added
- Artifact viewer and inbox portal
- Agents page with live agent monitoring (US-024)
- Beads detail view with bottom sheet (US-023)
- Beads page with list view and filters
- Pull-to-refresh and mobile interactions
- Client-side router and page framework
- Component CSS library and design tokens

### Changed
- Hardcoded server paths replaced with env-driven config

### Fixed
- Backend services PATH, beads/agents/artifacts fixes, smoke tests

## [0.1.0] - 2026-02-12

### Added
- Express 5 server with health check endpoint
- Error handling middleware and API utilities
- Beads, tmux/agents, docs, runs, Ralph, status API endpoints
- SSE streaming endpoint for realtime updates
- systemd service file and startup validation
- HTML shell and CSS design tokens
