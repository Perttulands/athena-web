# CLAUDE.md — Athena Web Project

## Stack
- Node.js 24.x, ES modules (type: "module")
- Express 5.x (latest stable)
- Vanilla HTML/CSS/JS frontend (no build step)
- SSE for real-time updates

## Rules
- Use latest stable versions of ALL npm packages. Never use outdated major versions.
- Run `npm audit` after any dependency change — zero vulnerabilities required.
- Use native Node.js APIs (fetch, crypto, fs/promises) over polyfills.
- No deprecated packages. Check npm before adding anything.
- ES module syntax throughout (import/export, not require).
- Docs describe what IS, never what WAS.

## Paths
- Workspace: $HOME/.openclaw/workspace (beads, state, docs)
- Tmux socket: /tmp/openclaw-coding-agents.sock (agent sessions)
- Beads CLI: bd (list/create/close)
- Port: 9000
