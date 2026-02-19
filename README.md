# 🏛️ Athena Web

![Banner](banner.jpg)

*Every thread visible. Every bead accounted for. No webpack required.*

---

Deep in the Agora, past the arena and the message runners and the dog with the red eye, there's a room with a loom. Not a metaphorical loom. A proper one, the size of a wall, with threads glowing in different colours — gold for open work, blue for in progress, green for done, red for blocked. Glass and bronze beads are strung on each thread. Where threads split and merge, you can see the git branches. A golden thread runs from the loom to Athena's wrist.

This is that room, rendered in vanilla JS and Express.

Athena was the goddess of weaving. This is her web — literally. A dashboard where you can see every agent, every bead of work, every document, and every run across the entire Agora. One screen to see everything that's happening, everything that's stuck, and everything that's about to go wrong.

No React. No Vue. No Svelte. No build step. No framework churn. No `node_modules` folder that's bigger than the actual application. It loads fast and stays out of your way, because the point is seeing the work, not admiring the dashboard framework.

## Stack

- **Node.js 24.x** with ES modules
- **Express 5.x** 
- **Vanilla HTML/CSS/JS** frontend (no build step, no transpilation, no regrets)
- **SSE** for real-time updates

## Install

```bash
git clone https://github.com/Perttulands/athena-web.git
cd athena-web
npm install
```

## Usage

```bash
# Start the server
node server.js
# → http://localhost:9000

# Or as a service
sudo cp deployment/systemd/athena-web.service /etc/systemd/system/
sudo systemctl enable --now athena-web

# Check it's alive
curl http://localhost:9000
```

## Development

```bash
# Run tests (224 of them)
npm test

# Watch mode
npm run dev
```

## For Agents

This repo includes `CLAUDE.md` and `AGENTS.md` with operational instructions.

```bash
git clone https://github.com/Perttulands/athena-web.git
cd athena-web
npm install
node server.js
```

Dependencies: Node.js 22+. That's the whole list.

## Part of the Agora

Athena Web was forged in **[Athena's Agora](https://github.com/Perttulands/athena-workspace)** — where the Loom Room is where you go to see the whole tapestry.

Every tool reports here. [Argus](https://github.com/Perttulands/argus) sends health data. [Beads](https://github.com/steveyegge/beads) tracks the work. Agents come and go. The Loom Room shows all of it — who's running, what's stuck, what just shipped. It's the control room for people who want to know what's actually happening instead of guessing.

The [mythology](https://github.com/Perttulands/athena-workspace/blob/main/mythology.md) has the full story.

## License

MIT
