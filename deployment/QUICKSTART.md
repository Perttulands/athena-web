# Athena Web - Production Deployment Quickstart

Fast deployment guide for $HOSTNAME server. For detailed instructions, see INSTALL.md.

## Prerequisites Check

```bash
node --version  # Must be 24.x
nginx -v        # Must be installed
tailscale status # Must be connected
ls $HOME/athena # Must exist
```

## 5-Minute Deployment

```bash
# 1. Install dependencies
cd $HOME/athena-web
npm install

# 2. Configure environment
cp deployment/env/.env.production.template .env.production
sed -i "s/<CHANGE_ME_GENERATE_RANDOM_SECRET>/$(openssl rand -hex 32)/" .env.production

# 3. Setup SSL
sudo deployment/scripts/ssl-setup.sh

# 4. Install systemd service
sudo cp deployment/systemd/athena-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable athena-web

# 5. Install Nginx config
sudo cp deployment/nginx/athena-web.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/athena-web.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 6. Start service
deployment/scripts/start.sh

# 7. Verify
deployment/scripts/health-check.sh
```

## Access

- HTTPS: https://athena.local
- Local: http://127.0.0.1:9000

## Essential Commands

```bash
# Status
sudo systemctl status athena-web

# Logs (live)
sudo journalctl -u athena-web -f

# Restart
sudo systemctl restart athena-web

# Health check
deployment/scripts/health-check.sh

# Backup
deployment/backup/backup.sh
```

## Troubleshooting

**Service won't start:**
```bash
deployment/scripts/pre-start.sh  # Run validation
sudo journalctl -u athena-web -n 50  # Check logs
```

**Port already in use:**
```bash
sudo lsof -i :9000  # Find process
sudo systemctl stop athena-web  # Stop service
```

**Nginx errors:**
```bash
sudo nginx -t  # Test config
sudo tail -f /var/log/nginx/error.log  # Check logs
```

## Complete Documentation

- **INSTALL.md** - Step-by-step installation guide
- **README.md** - Complete reference and troubleshooting
- **deployment/** - All configuration files and scripts

## Support

Run health check first: `deployment/scripts/health-check.sh`

Then check logs: `sudo journalctl -u athena-web -n 100`
