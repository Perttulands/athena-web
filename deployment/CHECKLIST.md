# Athena Web - Production Deployment Checklist

Use this checklist to ensure a complete and successful production deployment.

## Pre-Deployment

### System Requirements
- [ ] Server: ahjo-1 accessible via SSH
- [ ] OS: Ubuntu/Debian Linux (updated)
- [ ] Node.js: v24.x or higher installed
- [ ] User: `perttu` with sudo privileges
- [ ] Network: Tailscale installed and connected
- [ ] Git: Repository cloned to `$HOME/athena-web`

**Verification Commands:**
```bash
ssh perttu@ahjo-1
node --version  # Should be v24.x+
tailscale status  # Should show "online"
```

### Dependencies
- [ ] Nginx installed (`sudo apt install nginx`)
- [ ] OpenSSL installed (for certificate generation)
- [ ] systemd available (should be default)

**Verification:**
```bash
nginx -v
openssl version
systemctl --version
```

### Project Setup
- [ ] Code pulled from git (`git pull`)
- [ ] Dependencies installed (`npm install`)
- [ ] Tests passing (`npm test`)
- [ ] No uncommitted changes (or intentional)

**Verification:**
```bash
cd $HOME/athena-web
git status
npm test
```

## Deployment Steps

### 1. Automated Deployment (Recommended)

- [ ] Run deployment script: `./deployment/scripts/deploy.sh`
- [ ] Choose SSL certificate type (Tailscale recommended)
- [ ] Review any warnings or errors
- [ ] Confirm services started successfully

**If automated deployment succeeds, skip to Post-Deployment section.**

### 2. Manual Deployment (Alternative)

#### 2.1 SSL Certificates
- [ ] Run SSL setup: `./deployment/scripts/generate-ssl-cert.sh`
- [ ] Choose certificate type:
  - [ ] Option 1: Self-signed (testing only)
  - [ ] Option 2: Tailscale certificate (recommended)
  - [ ] Option 3: Manual/Let's Encrypt
- [ ] Verify certificate files exist:
  - [ ] `/etc/ssl/certs/athena.local.crt`
  - [ ] `/etc/ssl/private/athena.local.key`

#### 2.2 Nginx Configuration
- [ ] Copy config: `sudo cp deployment/nginx/athena.local.conf /etc/nginx/sites-available/`
- [ ] Enable site: `sudo ln -s /etc/nginx/sites-available/athena.local.conf /etc/nginx/sites-enabled/`
- [ ] Test config: `sudo nginx -t`
- [ ] Reload Nginx: `sudo systemctl reload nginx`

#### 2.3 Environment Configuration
- [ ] Create directory: `sudo mkdir -p /etc/athena-web`
- [ ] Copy env file: `sudo cp deployment/env.production /etc/athena-web/env`
- [ ] Review settings: `sudo nano /etc/athena-web/env`
- [ ] Set permissions: `sudo chmod 600 /etc/athena-web/env`

#### 2.4 Systemd Service
- [ ] Copy service: `sudo cp athena-web.service /etc/systemd/system/`
- [ ] Reload daemon: `sudo systemctl daemon-reload`
- [ ] Enable service: `sudo systemctl enable athena-web`
- [ ] Start service: `sudo systemctl start athena-web`
- [ ] Check status: `sudo systemctl status athena-web`

## Post-Deployment

### Verification

#### Service Status
- [ ] Service is active: `sudo systemctl is-active athena-web`
- [ ] Service enabled on boot: `sudo systemctl is-enabled athena-web`
- [ ] Process running: `pgrep -f "node server.js"`
- [ ] Port listening: `sudo ss -tlnp | grep :9000`

#### Nginx Status
- [ ] Nginx running: `sudo systemctl is-active nginx`
- [ ] Config valid: `sudo nginx -t`
- [ ] Ports listening: `sudo ss -tlnp | grep -E ':(80|443)'`

#### Network Connectivity
- [ ] Tailscale connected: `tailscale status`
- [ ] DNS resolves: `ping athena.local`
- [ ] HTTP redirects to HTTPS: `curl -I http://athena.local`
- [ ] HTTPS accessible: `curl -k https://athena.local/api/health`

#### Application Endpoints
- [ ] Health endpoint responds: `curl -k https://athena.local/api/health`
  - Expected: `{"status":"ok"}`
- [ ] Status endpoint: `curl -k https://athena.local/api/status`
- [ ] Static files served: `curl -I https://athena.local/`

#### SSL Certificate
- [ ] Certificate valid: `sudo openssl x509 -in /etc/ssl/certs/athena.local.crt -noout -dates`
- [ ] Certificate not expired
- [ ] No browser SSL warnings (for Tailscale cert)

### Health Check
- [ ] Run full health check: `./deployment/scripts/health-check.sh`
- [ ] All checks passing (or acceptable warnings documented)

### Logs Review
- [ ] Application logs clean: `sudo journalctl -u athena-web -n 50`
- [ ] Nginx access logs: `sudo tail -20 /var/log/nginx/athena.local.access.log`
- [ ] Nginx error logs: `sudo tail -20 /var/log/nginx/athena.local.error.log`
- [ ] No critical errors or unexpected warnings

### Performance Check
- [ ] Response time acceptable: `time curl -k https://athena.local/api/health`
  - Target: < 200ms
- [ ] Memory usage reasonable: `ps aux | grep "node server.js"`
  - Target: < 512MB
- [ ] CPU usage normal: `top -p $(pgrep -f "node server.js")`

### Browser Testing
- [ ] Open https://athena.local in browser
- [ ] No SSL warnings (if using Tailscale cert)
- [ ] Homepage loads correctly
- [ ] Navigation works (all tabs)
- [ ] Console has no errors (F12 → Console)
- [ ] Network requests succeed (F12 → Network)

## Security Hardening

### File Permissions
- [ ] App directory: `chown -R perttu:perttu $HOME/athena-web`
- [ ] SSL key secure: `sudo chmod 600 /etc/ssl/private/athena.local.key`
- [ ] SSL cert readable: `sudo chmod 644 /etc/ssl/certs/athena.local.crt`
- [ ] Env file secure: `sudo chmod 600 /etc/athena-web/env`

### Systemd Security
- [ ] NoNewPrivileges enabled (in service file)
- [ ] ProtectSystem enabled
- [ ] ProtectHome enabled
- [ ] MemoryDenyWriteExecute enabled
- [ ] Verify: `sudo systemctl show athena-web | grep -E "(NoNewPrivileges|ProtectSystem|ProtectHome)"`

### Nginx Security
- [ ] Security headers configured (view source of athena.local.conf)
- [ ] Rate limiting enabled
- [ ] HTTPS enforced (HTTP redirects)
- [ ] SSL protocols: TLSv1.2+ only

### Network Security
- [ ] Port 9000 NOT exposed to internet (check firewall)
- [ ] Only Nginx can access port 9000 (localhost only)
- [ ] Tailscale ACLs configured (if applicable)

## Optional Enhancements

### Automated Health Monitoring
- [ ] Copy health check service: `sudo cp deployment/systemd/athena-web-healthcheck.service /etc/systemd/system/`
- [ ] Copy health check timer: `sudo cp deployment/systemd/athena-web-healthcheck.timer /etc/systemd/system/`
- [ ] Reload daemon: `sudo systemctl daemon-reload`
- [ ] Enable timer: `sudo systemctl enable athena-web-healthcheck.timer`
- [ ] Start timer: `sudo systemctl start athena-web-healthcheck.timer`
- [ ] Verify: `sudo systemctl list-timers athena-web-healthcheck`

### Slack Integration
- [ ] Create Slack webhook URL
- [ ] Test health check with Slack: `./deployment/scripts/health-check.sh --slack-webhook <URL>`
- [ ] Update systemd service to include webhook

### System Tuning
- [ ] Increase file descriptors (see DEPLOYMENT.md)
- [ ] Optimize TCP settings (see DEPLOYMENT.md)
- [ ] Apply: `sudo sysctl -p`

### Backups
- [ ] Schedule workspace backups
- [ ] Test backup restoration
- [ ] Document backup location

### Monitoring
- [ ] Set up log rotation
- [ ] Configure disk space alerts
- [ ] Set up uptime monitoring (if applicable)

## Rollback Plan

If deployment fails:

- [ ] Document the failure (logs, error messages)
- [ ] Stop service: `sudo systemctl stop athena-web`
- [ ] Review logs: `sudo journalctl -u athena-web -n 100`
- [ ] Identify issue (SSL, permissions, config, etc.)
- [ ] Fix issue or rollback:
  - [ ] `git reset --hard <previous-commit>`
  - [ ] `npm install`
  - [ ] `sudo systemctl start athena-web`

## Sign-Off

### Deployment Team
- [ ] Deployment completed by: ________________
- [ ] Date/Time: ________________
- [ ] All checks passed: Yes / No
- [ ] Issues encountered: ________________

### Testing
- [ ] Functional testing completed
- [ ] Performance testing acceptable
- [ ] Security review completed
- [ ] Documentation updated

### Production Ready
- [ ] Application accessible at https://athena.local
- [ ] All endpoints responding correctly
- [ ] No critical errors in logs
- [ ] Performance meets requirements
- [ ] Security hardening applied
- [ ] Monitoring in place

**Deployment Status**: ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Failed

---

## Quick Reference

### Start/Stop
```bash
sudo systemctl start athena-web
sudo systemctl stop athena-web
sudo systemctl restart athena-web
```

### Logs
```bash
sudo journalctl -u athena-web -f
```

### Health Check
```bash
./deployment/scripts/health-check.sh
```

### Rollback
```bash
sudo systemctl stop athena-web
git reset --hard <commit>
npm install
sudo systemctl start athena-web
```

---

**May the Oracle guide your deployment.** 🦉
