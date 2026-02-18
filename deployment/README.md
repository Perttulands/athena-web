# Athena Web - Production Deployment Guide

Complete infrastructure for deploying Athena Web to production on $HOSTNAME server with Tailscale.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp deployment/env/.env.production.template .env.production
# Edit .env.production and update all <CHANGE_ME> values

# 3. Setup SSL certificates
sudo deployment/scripts/ssl-setup.sh

# 4. Install systemd service
sudo cp deployment/systemd/athena-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable athena-web

# 5. Install Nginx configuration
sudo cp deployment/nginx/athena-web.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/athena-web.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 6. Start the service
deployment/scripts/start.sh
```

## Directory Structure

```
deployment/
├── systemd/           # Systemd service files
│   └── athena-web.service
├── nginx/             # Nginx configuration
│   ├── athena-web.conf
│   └── security-headers.conf
├── scripts/           # Deployment scripts
│   ├── pre-start.sh          # Pre-start validation
│   ├── start.sh              # Production startup
│   ├── health-check.sh       # Health monitoring
│   └── ssl-setup.sh          # SSL certificate setup
├── monitoring/        # Monitoring configuration
│   ├── logrotate.conf
│   ├── prometheus.yml
│   ├── alerts.yml
│   └── grafana-dashboard.json
├── backup/            # Backup scripts
│   ├── backup.sh
│   ├── restore.sh
│   └── backup.cron
├── env/               # Environment templates
│   └── .env.production.template
└── README.md
```

## Components

### 1. Systemd Service

**File:** `systemd/athena-web.service`

Features:
- Automatic restart on failure (max 5 attempts in 5 minutes)
- Resource limits (512MB memory, 200% CPU)
- Security hardening (NoNewPrivileges, ProtectSystem)
- Pre-start health checks
- Structured logging to journald

**Commands:**
```bash
# Status
sudo systemctl status athena-web

# Start/Stop/Restart
sudo systemctl start athena-web
sudo systemctl stop athena-web
sudo systemctl restart athena-web

# Enable/Disable auto-start
sudo systemctl enable athena-web
sudo systemctl disable athena-web

# Logs
sudo journalctl -u athena-web -f
sudo journalctl -u athena-web -n 100
sudo journalctl -u athena-web --since "1 hour ago"
```

### 2. Nginx Reverse Proxy

**File:** `nginx/athena-web.conf`

Features:
- HTTPS with TLS 1.2/1.3
- Rate limiting (API: 10 req/s, Static: 100 req/s)
- Security headers (CSP, HSTS, X-Frame-Options)
- Gzip compression
- Static file caching (1 year)
- SSE support with proper timeouts
- Health check endpoint

**Endpoints:**
- `/` - Main application
- `/api/*` - API endpoints (rate limited)
- `/api/events` - SSE endpoint (24h timeout)
- `/health` - Health check (no rate limit)

**Commands:**
```bash
# Test configuration
sudo nginx -t

# Reload (no downtime)
sudo systemctl reload nginx

# Restart
sudo systemctl restart nginx

# Logs
tail -f /var/log/nginx/athena-web-access.log
tail -f /var/log/nginx/athena-web-error.log
```

### 3. SSL/TLS Configuration

**Script:** `scripts/ssl-setup.sh`

Generates self-signed certificates for internal Tailscale use.

**For production with real domain:**
```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal is configured via systemd timer
sudo systemctl status certbot.timer
```

### 4. Security Hardening

**CSP Policy:**
- Default: self only
- Scripts: self + unsafe-inline (for inline scripts)
- Styles: self + unsafe-inline
- Images: self + data URIs
- Connections: self only
- Frames: none (prevents clickjacking)

**Rate Limiting:**
- API endpoints: 10 req/s with burst of 20
- Static files: 100 req/s with burst of 20
- Connection limit: 10 per IP

**System Security:**
- Process isolation via systemd
- Read-only system directories
- Private /tmp
- Limited file access
- No privilege escalation

### 5. Monitoring

**Health Checks:**
```bash
# Run health check
deployment/scripts/health-check.sh

# With Slack notifications
deployment/scripts/health-check.sh --slack-webhook https://hooks.slack.com/...

# Check specific URL
deployment/scripts/health-check.sh --url https://athena.local
```

**Prometheus Metrics:**
1. Install Prometheus:
```bash
sudo apt install prometheus
sudo cp deployment/monitoring/prometheus.yml /etc/prometheus/
sudo systemctl restart prometheus
```

2. Install Node Exporter (system metrics):
```bash
sudo apt install prometheus-node-exporter
sudo systemctl enable prometheus-node-exporter
```

3. Access metrics:
- Prometheus: http://localhost:9090
- Application metrics: http://localhost:9001/metrics
- Node metrics: http://localhost:9100/metrics

**Grafana Dashboard:**
```bash
# Import dashboard
sudo cp deployment/monitoring/grafana-dashboard.json /var/lib/grafana/dashboards/
```

**Log Rotation:**
```bash
# Install logrotate config
sudo cp deployment/monitoring/logrotate.conf /etc/logrotate.d/athena-web

# Test rotation
sudo logrotate -f /etc/logrotate.d/athena-web
```

### 6. Backup & Restore

**Backup Strategy:**
- Application configuration
- Environment files
- Logs
- Workspace data
- SSL certificates
- System configuration files

**Manual Backup:**
```bash
deployment/backup/backup.sh
```

**Automated Backups:**
```bash
# Install cron jobs
crontab -e
# Add contents from deployment/backup/backup.cron
```

**Restore:**
```bash
# List backups
ls -lh $HOME/athena-web/backups/

# Restore from backup
deployment/backup/restore.sh 20260213_140000
```

**Backup Retention:**
- Default: 30 days
- Automatic cleanup of old backups
- Configurable in .env.production (BACKUP_RETENTION_DAYS)

## Environment Configuration

**Required Variables:**
```bash
# Generate session secret
openssl rand -hex 32

# Update .env.production
SESSION_SECRET=<generated_secret>
```

**Optional Integrations:**
```bash
# Slack/Discord alerts
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...

# Email alerts
ALERT_EMAIL=admin@example.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

## Networking

**Tailscale Configuration:**
- Application listens on: `127.0.0.1:9000` (localhost only)
- Nginx listens on: `0.0.0.0:443` (all interfaces)
- Access via: `https://athena.local` (through Tailscale)

**Firewall (ufw):**
```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow Tailscale
sudo ufw allow in on tailscale0
```

## Troubleshooting

### Service won't start

```bash
# Check pre-start validation
$HOME/athena-web/deployment/scripts/pre-start.sh

# Check logs
sudo journalctl -u athena-web -n 50

# Check if port is in use
sudo lsof -i :9000
```

### High memory usage

```bash
# Check memory
ps aux | grep node

# Restart service
sudo systemctl restart athena-web

# Monitor in real-time
watch -n 1 'ps aux | grep node'
```

### SSL certificate issues

```bash
# Check certificate
sudo openssl x509 -in /etc/ssl/certs/athena.local.crt -noout -dates

# Regenerate
sudo deployment/scripts/ssl-setup.sh
sudo systemctl reload nginx
```

### Nginx configuration errors

```bash
# Test configuration
sudo nginx -t

# Check syntax
sudo nginx -T

# Reload if OK
sudo systemctl reload nginx
```

### Workspace access issues

```bash
# Check permissions
ls -la $HOME/athena

# Fix permissions
sudo chown -R $USER:$USER $HOME/athena
sudo chmod -R 755 $HOME/athena
```

## Performance Tuning

### Node.js

Edit `systemd/athena-web.service`:
```ini
[Service]
Environment=NODE_OPTIONS="--max-old-space-size=512"
```

### Nginx

Edit `nginx/athena-web.conf`:
```nginx
# Increase worker connections
worker_connections 1024;

# Adjust buffer sizes
client_body_buffer_size 128k;
client_max_body_size 10m;
```

### System

```bash
# Increase file descriptors
sudo sysctl -w fs.file-max=100000
echo "fs.file-max = 100000" | sudo tee -a /etc/sysctl.conf

# Increase connection tracking
sudo sysctl -w net.netfilter.nf_conntrack_max=131072
```

## Maintenance

### Regular Tasks

**Daily:**
- Check logs: `sudo journalctl -u athena-web -n 100`
- Check disk space: `df -h`
- Verify backups exist

**Weekly:**
- Run health check: `deployment/scripts/health-check.sh`
- Review Prometheus alerts
- Check for security updates: `sudo apt update && sudo apt list --upgradable`

**Monthly:**
- Review and archive old logs
- Update dependencies: `npm outdated`
- Review Nginx logs for patterns
- Check SSL certificate expiration

### Updates

```bash
# Update dependencies
npm update
npm audit fix

# Test locally first
npm test

# Deploy update
sudo systemctl stop athena-web
npm install --production
sudo systemctl start athena-web

# Verify
deployment/scripts/health-check.sh
```

## Security Checklist

- [ ] `.env.production` has unique SESSION_SECRET
- [ ] File permissions are correct (config files: 600, scripts: 700)
- [ ] Firewall is enabled and configured
- [ ] SSL certificates are valid and not expiring soon
- [ ] Nginx security headers are enabled
- [ ] Rate limiting is configured
- [ ] Logs are being rotated
- [ ] Backups are running and tested
- [ ] Service is running with limited permissions
- [ ] Dependencies are up to date
- [ ] No sensitive data in logs

## Architecture

```
Internet/Tailscale
        │
        ▼
    [Nginx :443]
        │
        ├─ Rate Limiting
        ├─ SSL Termination
        ├─ Security Headers
        ├─ Static File Caching
        │
        ▼
[Athena Web :9000]
        │
        ├─ Express Server
        ├─ SSE Connections
        ├─ API Endpoints
        │
        ▼
[OpenClaw Workspace]
        │
        ├─ Beads Data
        ├─ State Files
        └─ Documentation
```

## Support

For issues:
1. Check logs: `sudo journalctl -u athena-web -n 100`
2. Run health check: `deployment/scripts/health-check.sh`
3. Review this documentation
4. Check systemd status: `sudo systemctl status athena-web`

## License

Same as main application.
