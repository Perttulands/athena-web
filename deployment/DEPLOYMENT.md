# Athena Web - Production Deployment Guide

## Overview

This guide covers deploying Athena Web to production on ahjo-1 with Nginx reverse proxy, SSL/TLS, and systemd service management. The application will be accessible at `https://athena.local` on your Tailscale network.

## Architecture

```
[Tailscale Network] → [Nginx :443] → [Node.js :9000] → [Workspace/Beads]
                           ↓
                      SSL/TLS
                      Rate Limiting
                      Static Files
                      Compression
```

## Prerequisites

### System Requirements

- **Server**: ahjo-1 (Ubuntu/Debian Linux)
- **Node.js**: v24.x or higher
- **Nginx**: Latest stable version
- **Network**: Tailscale configured and connected
- **User**: perttu with sudo privileges

### Verification

```bash
# Check Node.js version
node --version  # Should be v24.x or higher

# Check Tailscale status
tailscale status

# Check Nginx
nginx -v
```

## Quick Start

### Automated Deployment

The easiest way to deploy is using the automated deployment script:

```bash
cd $HOME/athena-web
./deployment/scripts/deploy.sh
```

This script will:
1. ✅ Install system dependencies (nginx)
2. ✅ Install Node.js dependencies
3. ✅ Run tests
4. ✅ Set up SSL certificates
5. ✅ Configure Nginx
6. ✅ Configure systemd service
7. ✅ Start all services

### Manual Deployment

For more control, follow the manual steps below.

## Manual Deployment Steps

### 1. Install Dependencies

```bash
cd $HOME/athena-web

# Install Node.js dependencies
npm install

# Install nginx if not present
sudo apt update
sudo apt install -y nginx
```

### 2. Run Tests

```bash
npm test
```

Ensure all tests pass before deploying.

### 3. SSL Certificate Setup

Choose one of the following options:

#### Option A: Tailscale Certificate (Recommended)

```bash
# Generate Tailscale certificate
sudo tailscale cert athena.local

# Copy to standard locations
sudo cp /var/lib/tailscale/certs/athena.local.crt /etc/ssl/certs/
sudo cp /var/lib/tailscale/certs/athena.local.key /etc/ssl/private/
sudo chmod 644 /etc/ssl/certs/athena.local.crt
sudo chmod 600 /etc/ssl/private/athena.local.key
```

#### Option B: Self-Signed Certificate (Testing)

```bash
./deployment/scripts/generate-ssl-cert.sh
# Select option 1 for self-signed
```

⚠️ **Warning**: Self-signed certificates will trigger browser warnings.

#### Option C: Let's Encrypt (Public Access)

If you have public DNS configured:

```bash
sudo certbot --nginx -d athena.local
```

### 4. Configure Nginx

```bash
# Copy Nginx configuration
sudo cp deployment/nginx/athena.local.conf /etc/nginx/sites-available/

# Create symbolic link to enable site
sudo ln -s /etc/nginx/sites-available/athena.local.conf /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 5. Environment Configuration

```bash
# Create environment directory
sudo mkdir -p /etc/athena-web

# Copy production environment file
sudo cp deployment/env.production /etc/athena-web/env

# Edit if needed
sudo nano /etc/athena-web/env
```

Default environment variables:
- `NODE_ENV=production`
- `PORT=9000`
- `WORKSPACE_PATH=$HOME/.openclaw/workspace`
- `BEADS_CLI=br`

### 6. Configure Systemd Service

```bash
# Copy service file
sudo cp athena-web.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable athena-web

# Start service
sudo systemctl start athena-web

# Check status
sudo systemctl status athena-web
```

### 7. Verify Deployment

```bash
# Check service status
sudo systemctl status athena-web

# Check logs
sudo journalctl -u athena-web -n 50

# Test health endpoint
curl -k https://athena.local/api/health

# Expected response: {"status":"ok"}
```

## Security Features

### Nginx Security Headers

- **X-Frame-Options**: Prevents clickjacking
- **X-Content-Type-Options**: Prevents MIME-type sniffing
- **X-XSS-Protection**: Enables XSS filtering
- **Content-Security-Policy**: Restricts resource loading
- **Strict-Transport-Security**: Enforces HTTPS (after enabling)

### Rate Limiting

API endpoints are rate-limited to 10 requests/second with burst allowance of 20.

### Systemd Security Hardening

The service runs with strict security restrictions:
- `NoNewPrivileges`: Cannot escalate privileges
- `ProtectSystem`: Read-only system directories
- `ProtectHome`: Limited home directory access
- `PrivateTmp`: Isolated temporary directory
- `MemoryDenyWriteExecute`: Prevents code injection
- `RestrictAddressFamilies`: Limited network protocols
- `SystemCallFilter`: Restricted system calls

### File Permissions

```bash
# Application files
chown -R perttu:perttu $HOME/athena-web

# SSL certificates
chmod 600 /etc/ssl/private/athena.local.key
chmod 644 /etc/ssl/certs/athena.local.crt

# Environment file
sudo chmod 600 /etc/athena-web/env
```

## Performance Optimization

### Nginx Optimizations

1. **Gzip Compression**: Enabled for text/css/js/json
2. **Static File Caching**: 1-year cache for assets
3. **Keep-Alive Connections**: Reduced overhead
4. **HTTP/2**: Faster multiplexed connections

### Node.js Optimizations

The application runs in production mode with:
- Disabled test routes
- Minimal logging
- Optimized middleware

### Recommended System Tuning

```bash
# Increase file descriptor limits
echo "perttu soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "perttu hard nofile 65536" | sudo tee -a /etc/security/limits.conf

# Optimize TCP settings (add to /etc/sysctl.conf)
sudo tee -a /etc/sysctl.conf <<EOF
net.core.somaxconn = 1024
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.ip_local_port_range = 10000 65000
EOF

sudo sysctl -p
```

## Monitoring & Maintenance

### View Logs

```bash
# Follow application logs
sudo journalctl -u athena-web -f

# View last 100 lines
sudo journalctl -u athena-web -n 100

# View logs from today
sudo journalctl -u athena-web --since today

# Nginx access logs
sudo tail -f /var/log/nginx/athena.local.access.log

# Nginx error logs
sudo tail -f /var/log/nginx/athena.local.error.log
```

### Service Management

```bash
# Start service
sudo systemctl start athena-web

# Stop service
sudo systemctl stop athena-web

# Restart service
sudo systemctl restart athena-web

# Reload configuration (graceful restart)
sudo systemctl reload athena-web

# Check status
sudo systemctl status athena-web

# View startup time
systemd-analyze blame | grep athena-web
```

### Health Checks

```bash
# Application health
curl -k https://athena.local/api/health

# Nginx status
sudo systemctl status nginx

# Check listening ports
sudo ss -tlnp | grep -E ':(80|443|9000)'

# Check Tailscale connectivity
tailscale status
```

### Updates and Redeployment

```bash
cd $HOME/athena-web

# Pull latest changes
git pull

# Install dependencies
npm install

# Run tests
npm test

# Restart service
sudo systemctl restart athena-web

# Verify
sudo systemctl status athena-web
```

## Troubleshooting

### Service Won't Start

```bash
# Check service status
sudo systemctl status athena-web

# View detailed logs
sudo journalctl -u athena-web -n 100 --no-pager

# Common issues:
# 1. Port 9000 already in use
sudo ss -tlnp | grep :9000

# 2. Workspace path doesn't exist
ls -la $HOME/.openclaw/workspace

# 3. Permission issues
sudo chown -R perttu:perttu $HOME/athena-web
```

### Nginx Issues

```bash
# Test configuration
sudo nginx -t

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Reload Nginx
sudo systemctl reload nginx

# Common issues:
# 1. SSL certificate not found
ls -la /etc/ssl/certs/athena.local.crt
ls -la /etc/ssl/private/athena.local.key

# 2. Port 443 already in use
sudo ss -tlnp | grep :443
```

### SSL Certificate Issues

```bash
# Verify certificate
sudo openssl x509 -in /etc/ssl/certs/athena.local.crt -noout -text

# Check expiration
sudo openssl x509 -in /etc/ssl/certs/athena.local.crt -noout -dates

# Test SSL connection
openssl s_client -connect athena.local:443

# Renew Tailscale certificate (if using Tailscale)
sudo tailscale cert athena.local
```

### Application Errors

```bash
# Check application logs
sudo journalctl -u athena-web -f

# Test direct connection to Node.js
curl http://localhost:9000/api/health

# Restart with verbose logging
sudo systemctl stop athena-web
cd $HOME/athena-web
NODE_ENV=production node server.js
# (Ctrl+C to stop, then restart service)
```

### Performance Issues

```bash
# Check system resources
htop
# or
top -p $(pgrep -f "node server.js")

# Check memory usage
sudo systemctl status athena-web | grep Memory

# Check disk usage
df -h
du -sh $HOME/athena-web

# Monitor network connections
sudo ss -tan | grep :9000
```

## Backup and Recovery

### Backup Application Data

```bash
# Backup workspace
tar -czf athena-backup-$(date +%Y%m%d).tar.gz \
  $HOME/.openclaw/workspace

# Backup configuration
sudo tar -czf athena-config-$(date +%Y%m%d).tar.gz \
  /etc/athena-web \
  /etc/nginx/sites-available/athena.local.conf \
  /etc/systemd/system/athena-web.service
```

### Restore from Backup

```bash
# Restore workspace
tar -xzf athena-backup-YYYYMMDD.tar.gz -C /

# Restore configuration
sudo tar -xzf athena-config-YYYYMMDD.tar.gz -C /

# Reload services
sudo systemctl daemon-reload
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl restart athena-web
```

## Rollback Procedure

```bash
# Stop service
sudo systemctl stop athena-web

# Restore previous version from git
cd $HOME/athena-web
git reset --hard <previous-commit>

# Reinstall dependencies
npm install

# Start service
sudo systemctl start athena-web
```

## Firewall Configuration

If using UFW or iptables:

```bash
# UFW
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload

# iptables
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

**Note**: Port 9000 should NOT be exposed externally - only Nginx on localhost should access it.

## Security Checklist

- [ ] SSL/TLS certificate installed and valid
- [ ] HSTS header enabled (after testing SSL works)
- [ ] Rate limiting configured
- [ ] Security headers enabled
- [ ] Firewall configured (if applicable)
- [ ] Service running with minimal privileges
- [ ] File permissions set correctly
- [ ] Environment file secured (chmod 600)
- [ ] Regular backups scheduled
- [ ] Log rotation configured
- [ ] Dependency updates scheduled

## Performance Checklist

- [ ] Gzip compression enabled
- [ ] Static file caching configured
- [ ] HTTP/2 enabled
- [ ] Keep-alive connections optimized
- [ ] System limits increased
- [ ] Monitoring in place
- [ ] Health checks automated

## Support

For issues or questions:
- Check logs: `sudo journalctl -u athena-web -f`
- Test health: `curl -k https://athena.local/api/health`
- Review configuration files
- Check Tailscale connectivity
- Verify workspace path and beads CLI

---

**The Oracle sees all, knows all. May your deployment be blessed with uptime.** 🦉
