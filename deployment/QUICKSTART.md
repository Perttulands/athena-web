# Athena Web - Quick Start Guide

## One-Line Deploy

```bash
cd $HOME/athena-web && ./deployment/scripts/deploy.sh
```

## Essential Commands

### Service Management

```bash
# Start
sudo systemctl start athena-web

# Stop
sudo systemctl stop athena-web

# Restart
sudo systemctl restart athena-web

# Status
sudo systemctl status athena-web

# Logs (follow)
sudo journalctl -u athena-web -f
```

### Health Check

```bash
# Quick check
curl -k https://athena.local/api/health

# Detailed check
./deployment/scripts/health-check.sh
```

### Nginx

```bash
# Test config
sudo nginx -t

# Reload
sudo systemctl reload nginx

# Restart
sudo systemctl restart nginx
```

## Troubleshooting

### Service won't start

```bash
sudo journalctl -u athena-web -n 100
sudo systemctl status athena-web
```

### Can't access site

```bash
# Check port
sudo ss -tlnp | grep :9000

# Check Nginx
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log

# Check Tailscale
tailscale status
```

### SSL issues

```bash
# Verify cert
sudo openssl x509 -in /etc/ssl/certs/athena.local.crt -noout -dates

# Regenerate
./deployment/scripts/generate-ssl-cert.sh
```

## File Locations

| Component | Path |
|-----------|------|
| Application | `$HOME/athena-web` |
| Workspace | `$HOME/.openclaw/workspace` |
| Nginx config | `/etc/nginx/sites-available/athena.local.conf` |
| Systemd service | `/etc/systemd/system/athena-web.service` |
| Environment | `/etc/athena-web/env` |
| SSL cert | `/etc/ssl/certs/athena.local.crt` |
| SSL key | `/etc/ssl/private/athena.local.key` |
| Access log | `/var/log/nginx/athena.local.access.log` |
| Error log | `/var/log/nginx/athena.local.error.log` |

## URLs

- **HTTPS**: https://athena.local
- **HTTP**: http://athena.local (redirects to HTTPS)
- **Health**: https://athena.local/api/health

## Quick Fixes

### Restart Everything

```bash
sudo systemctl restart athena-web
sudo systemctl reload nginx
```

### Check Everything

```bash
./deployment/scripts/health-check.sh
```

### Update Code

```bash
cd $HOME/athena-web
git pull
npm install
npm test
sudo systemctl restart athena-web
```

### View Real-Time Logs

```bash
# Application
sudo journalctl -u athena-web -f

# Nginx access
sudo tail -f /var/log/nginx/athena.local.access.log

# Nginx errors
sudo tail -f /var/log/nginx/athena.local.error.log

# All together
sudo journalctl -u athena-web -f & sudo tail -f /var/log/nginx/athena.local.error.log
```

## Performance Monitoring

```bash
# Response time test
time curl -k https://athena.local/api/health

# Memory usage
ps aux | grep "node server.js"

# Active connections
sudo ss -tan | grep :9000 | wc -l

# System resources
htop
```

---

**For full documentation, see [DEPLOYMENT.md](DEPLOYMENT.md)**
