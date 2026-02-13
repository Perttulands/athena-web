# Athena Web — The Oracle's Interface 🦉

**Ancient Greek oracle interface for AI coding agent swarm management**

## Quick Start

### Development

```bash
npm install
npm run dev
```

Visit http://localhost:9000

### Production Deployment

```bash
cd $HOME/athena-web
./deployment/scripts/deploy.sh
```

Access at https://athena.local (Tailscale network)

## Documentation

- **[Deployment Guide](deployment/DEPLOYMENT.md)** - Complete production deployment instructions
- **[Quick Start](deployment/QUICKSTART.md)** - Essential commands and troubleshooting
- **[PRD](PRD_ATHENA_WEB.md)** - Product requirements and architecture

## Architecture

- **Backend**: Node.js 24.x + Express 5.x
- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **Real-time**: Server-Sent Events (SSE)
- **Deployment**: Nginx reverse proxy + systemd
- **Network**: Tailscale with SSL/TLS

## Features

- 📊 **Agent Status Dashboard** - Monitor running agents and swarm health
- 🔮 **Beads Management** - Create, view, and close beads
- 📜 **Chronicle** - View agent run history and logs
- 📚 **Scrolls** - Browse workspace documentation
- ⚡ **Real-time Updates** - SSE for live status updates
- 🎨 **Ancient Greek Theme** - Serif typography and classical design

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/status` - System status
- `GET /api/beads` - List beads
- `GET /api/agents` - List agents
- `GET /api/docs` - Browse documentation
- `GET /api/runs` - Agent run history
- `GET /api/stream/events` - SSE event stream

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Development mode (auto-reload)
npm run dev

# Production mode
npm start
```

## Project Structure

```
athena-web/
├── public/          # Static frontend files
│   ├── css/         # Stylesheets
│   ├── js/          # Client-side JavaScript
│   └── index.html   # Main HTML shell
├── routes/          # Express route handlers
├── services/        # Business logic
├── middleware/      # Express middleware
├── deployment/      # Deployment configs and scripts
│   ├── nginx/       # Nginx configuration
│   ├── scripts/     # Deployment and health check scripts
│   └── systemd/     # Systemd service files
├── tests/           # Test suites
└── server.js        # Express server entry point
```

## Production Deployment

See [deployment/DEPLOYMENT.md](deployment/DEPLOYMENT.md) for comprehensive deployment instructions including:

- SSL/TLS certificate setup (Tailscale or self-signed)
- Nginx reverse proxy configuration
- Systemd service configuration
- Security hardening
- Performance optimization
- Monitoring and maintenance

### Quick Deploy

```bash
./deployment/scripts/deploy.sh
```

### Health Check

```bash
./deployment/scripts/health-check.sh
```

## Stack

- **Node.js**: 24.x (ES modules)
- **Express**: 5.x (latest stable)
- **Frontend**: Vanilla JS (no build tools)
- **Server**: Nginx (reverse proxy)
- **Process Manager**: systemd
- **Network**: Tailscale
- **SSL/TLS**: Tailscale certs or Let's Encrypt

## Configuration

Environment variables (see `deployment/env.production`):

- `NODE_ENV` - Node environment (production/development)
- `PORT` - Server port (default: 9000)
- `WORKSPACE_PATH` - Path to workspace directory
- `BEADS_CLI` - Beads CLI command (default: br)

## Security Features

- ✅ HTTPS with SSL/TLS
- ✅ Security headers (XSS, CSRF, CSP)
- ✅ Rate limiting (10 req/s + burst)
- ✅ Systemd sandboxing
- ✅ Input validation
- ✅ Error sanitization in production

## Performance

- ✅ Gzip compression
- ✅ Static file caching (1 year)
- ✅ ETag support
- ✅ HTTP/2
- ✅ Connection keep-alive
- ✅ Response time monitoring

## Monitoring

```bash
# Service logs
sudo journalctl -u athena-web -f

# Nginx logs
sudo tail -f /var/log/nginx/athena.local.access.log
sudo tail -f /var/log/nginx/athena.local.error.log

# Health check
curl -k https://athena.local/api/health
```

## License

MIT

---

**The Oracle sees all, knows all.** 🦉
