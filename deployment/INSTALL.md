# Athena Web - Installation Guide for ahjo-1

Step-by-step installation instructions for deploying Athena Web to the ahjo-1 server.

## Prerequisites

- Ubuntu/Debian Linux (ahjo-1 server)
- Node.js 24.x or higher
- Nginx installed
- Sudo/root access
- Tailscale configured
- OpenClaw workspace at `$HOME/.openclaw/workspace`

## Installation Steps

### 1. System Preparation

```bash
# Update system
sudo apt update
sudo apt upgrade -y

# Install required packages
sudo apt install -y \
    nginx \
    certbot \
    python3-certbot-nginx \
    logrotate \
    curl \
    git

# Install Node.js 24.x (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# Verify versions
node --version   # Should be v24.x.x
npm --version
nginx -v
```

### 2. Application Setup

```bash
# Navigate to application directory
cd $HOME/athena-web

# Install dependencies
npm install --production

# Create required directories
mkdir -p logs backups

# Set permissions
chmod 755 $HOME/athena-web
chmod 755 $HOME/.openclaw/workspace
```

### 3. Environment Configuration

```bash
# Copy environment template
cp deployment/env/.env.production.template .env.production

# Generate session secret
SESSION_SECRET=$(openssl rand -hex 32)

# Edit environment file
nano .env.production
# Update SESSION_SECRET with generated value
# Review and update other settings as needed

# Secure environment file
chmod 600 .env.production
```

### 4. SSL Certificate Setup

```bash
# Generate self-signed certificate for Tailscale
sudo deployment/scripts/ssl-setup.sh

# Verify certificates were created
sudo ls -la /etc/ssl/certs/athena.local.crt
sudo ls -la /etc/ssl/private/athena.local.key
```

**For production with real domain:**
```bash
# Stop nginx temporarily
sudo systemctl stop nginx

# Get Let's Encrypt certificate
sudo certbot certonly --standalone -d yourdomain.com

# Update nginx config to use new certificate
sudo nano /etc/nginx/sites-available/athena-web.conf
# Change certificate paths:
#   ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
#   ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

# Start nginx
sudo systemctl start nginx
```

### 5. Systemd Service Installation

```bash
# Copy service file
sudo cp deployment/systemd/athena-web.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable athena-web

# Verify service file
sudo systemctl cat athena-web
```

### 6. Nginx Configuration

```bash
# Copy nginx configuration
sudo cp deployment/nginx/athena-web.conf /etc/nginx/sites-available/

# Create symlink to enable site
sudo ln -s /etc/nginx/sites-available/athena-web.conf /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

### 7. Logrotate Configuration

```bash
# Copy logrotate configuration
sudo cp deployment/monitoring/logrotate.conf /etc/logrotate.d/athena-web

# Test logrotate
sudo logrotate -d /etc/logrotate.d/athena-web
```

### 8. Start the Service

```bash
# Start Athena Web
deployment/scripts/start.sh

# Or manually:
sudo systemctl start athena-web

# Check status
sudo systemctl status athena-web

# View logs
sudo journalctl -u athena-web -f
```

### 9. Verify Installation

```bash
# Run health check
deployment/scripts/health-check.sh

# Test local endpoint
curl http://127.0.0.1:9000/health

# Test HTTPS endpoint (via Tailscale)
curl -k https://athena.local/health

# Check if port is listening
sudo ss -tlnp | grep 9000
```

### 10. Setup Automated Backups

```bash
# Open crontab
crontab -e

# Add backup jobs (from deployment/backup/backup.cron)
0 2 * * * $HOME/athena-web/deployment/backup/backup.sh >> $HOME/athena-web/logs/backup.log 2>&1

# Test backup manually
deployment/backup/backup.sh

# Verify backup was created
ls -lh $HOME/athena-web/backups/
```

### 11. Optional: Prometheus Monitoring

```bash
# Install Prometheus
sudo apt install -y prometheus prometheus-node-exporter

# Copy Prometheus configuration
sudo cp deployment/monitoring/prometheus.yml /etc/prometheus/
sudo cp deployment/monitoring/alerts.yml /etc/prometheus/

# Restart Prometheus
sudo systemctl restart prometheus
sudo systemctl enable prometheus

# Enable node exporter
sudo systemctl enable prometheus-node-exporter
sudo systemctl start prometheus-node-exporter

# Access Prometheus
# http://localhost:9090
```

### 12. Optional: Grafana Dashboard

```bash
# Install Grafana
sudo apt install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
sudo apt update
sudo apt install -y grafana

# Start Grafana
sudo systemctl enable grafana-server
sudo systemctl start grafana-server

# Access Grafana
# http://localhost:3000 (default: admin/admin)

# Import dashboard
# Copy contents of deployment/monitoring/grafana-dashboard.json
```

## Post-Installation

### Firewall Configuration

```bash
# Enable firewall
sudo ufw enable

# Allow SSH
sudo ufw allow ssh

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow Tailscale
sudo ufw allow in on tailscale0

# Check status
sudo ufw status
```

### Service Management

```bash
# Start/stop/restart
sudo systemctl start athena-web
sudo systemctl stop athena-web
sudo systemctl restart athena-web

# View status
sudo systemctl status athena-web

# View logs
sudo journalctl -u athena-web -f
sudo journalctl -u athena-web -n 100
sudo journalctl -u athena-web --since "1 hour ago"

# View nginx logs
tail -f /var/log/nginx/athena-web-access.log
tail -f /var/log/nginx/athena-web-error.log
```

### Accessing the Application

**Via Tailscale:**
- https://athena.local (if DNS configured)
- https://athena:9000 (direct, if nginx not used)
- https://100.x.x.x (Tailscale IP)

**Locally on server:**
- http://127.0.0.1:9000
- http://localhost:9000

## Verification Checklist

- [ ] Node.js 24.x installed
- [ ] Nginx installed and running
- [ ] Application dependencies installed
- [ ] Environment file configured
- [ ] SSL certificates generated
- [ ] Systemd service enabled and running
- [ ] Nginx configured and running
- [ ] Health check passes
- [ ] Application accessible via HTTPS
- [ ] Logs are being written
- [ ] Logrotate configured
- [ ] Automated backups configured
- [ ] Firewall configured
- [ ] Service auto-starts on boot

## Troubleshooting

### Service fails to start

```bash
# Check pre-start validation
$HOME/athena-web/deployment/scripts/pre-start.sh

# Check logs for errors
sudo journalctl -u athena-web -n 50 --no-pager

# Check if port is already in use
sudo lsof -i :9000

# Verify environment file exists
ls -la $HOME/athena-web/.env.production
```

### Nginx configuration errors

```bash
# Test configuration
sudo nginx -t

# Check full configuration
sudo nginx -T

# View nginx error log
sudo tail -f /var/log/nginx/error.log
```

### Permission issues

```bash
# Fix application permissions
sudo chown -R perttu:perttu $HOME/athena-web
chmod 755 $HOME/athena-web

# Fix workspace permissions
sudo chown -R perttu:perttu $HOME/.openclaw/workspace
chmod 755 $HOME/.openclaw/workspace

# Fix log directory
mkdir -p $HOME/athena-web/logs
chmod 755 $HOME/athena-web/logs
```

### Cannot access via HTTPS

```bash
# Check if nginx is running
sudo systemctl status nginx

# Check if service is listening
sudo ss -tlnp | grep 443

# Check Tailscale connectivity
tailscale status

# Check firewall
sudo ufw status

# Test local access
curl -k https://localhost/health
```

## Rollback

If you need to rollback the installation:

```bash
# Stop service
sudo systemctl stop athena-web
sudo systemctl disable athena-web

# Remove systemd service
sudo rm /etc/systemd/system/athena-web.service
sudo systemctl daemon-reload

# Remove nginx config
sudo rm /etc/nginx/sites-enabled/athena-web.conf
sudo rm /etc/nginx/sites-available/athena-web.conf
sudo systemctl reload nginx

# Remove logrotate config
sudo rm /etc/logrotate.d/athena-web

# Restore from backup if needed
deployment/backup/restore.sh <backup_timestamp>
```

## Next Steps

1. Configure monitoring alerts
2. Set up log aggregation (if needed)
3. Configure automated security updates
4. Document any custom configuration
5. Test backup and restore procedure
6. Create runbook for common operations

## Support

For issues, see deployment/README.md troubleshooting section or check:
- Application logs: `sudo journalctl -u athena-web -f`
- Nginx logs: `tail -f /var/log/nginx/athena-web-error.log`
- Health check: `deployment/scripts/health-check.sh`
