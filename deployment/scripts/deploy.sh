#!/bin/bash
# Athena Web Deployment Script
#
# Usage:
#   ./deploy.sh [--skip-deps] [--skip-ssl] [--skip-nginx] [--skip-systemd]
#
# This script:
#   1. Installs system dependencies
#   2. Installs Node.js dependencies
#   3. Runs tests
#   4. Sets up SSL certificates
#   5. Configures Nginx
#   6. Configures systemd service
#   7. Starts the service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="${PROJECT_DIR:-$HOME/athena-web}"
DOMAIN="athena.local"
NGINX_AVAILABLE="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"
SYSTEMD_DIR="/etc/systemd/system"
ENV_DIR="/etc/athena-web"
CURRENT_HOST="$(hostname)"
TARGET_HOST="${DEPLOY_TARGET_HOST:-$CURRENT_HOST}"
TARGET_USER="${DEPLOY_TARGET_USER:-${USER:-$(id -un)}}"

# Parse arguments
SKIP_DEPS=false
SKIP_SSL=false
SKIP_NGINX=false
SKIP_SYSTEMD=false

for arg in "$@"; do
  case $arg in
    --skip-deps) SKIP_DEPS=true ;;
    --skip-ssl) SKIP_SSL=true ;;
    --skip-nginx) SKIP_NGINX=true ;;
    --skip-systemd) SKIP_SYSTEMD=true ;;
    --help)
      echo "Usage: $0 [--skip-deps] [--skip-ssl] [--skip-nginx] [--skip-systemd]"
      exit 0
      ;;
  esac
done

echo -e "${BLUE}🦉 Athena Web Deployment Script${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Check host target
if [[ "$CURRENT_HOST" != "$TARGET_HOST" ]]; then
  echo -e "${YELLOW}⚠️  Warning: Not running on target host '$TARGET_HOST' (current: $CURRENT_HOST)${NC}"
  read -p "Continue anyway? [y/N]: " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Check if running as correct user
if [[ "${USER:-$(id -un)}" != "$TARGET_USER" ]]; then
  echo -e "${RED}❌ Error: This script should be run as user '$TARGET_USER'${NC}"
  exit 1
fi

cd "$PROJECT_DIR"

# Step 1: System dependencies
if [[ "$SKIP_DEPS" == false ]]; then
  echo -e "${GREEN}[1/8] Installing system dependencies...${NC}"

  # Check for nginx
  if ! command -v nginx &> /dev/null; then
    echo "Installing nginx..."
    sudo apt update
    sudo apt install -y nginx
  else
    echo "✓ nginx already installed"
  fi

  # Check for Node.js
  if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js not found${NC}"
    echo "Install Node.js 24.x first"
    exit 1
  fi

  NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
  if [[ "$NODE_VERSION" -lt 24 ]]; then
    echo -e "${RED}❌ Error: Node.js version must be 24 or higher (found: v$NODE_VERSION)${NC}"
    exit 1
  fi
  echo "✓ Node.js v$(node --version) installed"
else
  echo -e "${YELLOW}[1/8] Skipping system dependencies...${NC}"
fi

# Step 2: Node.js dependencies
echo -e "${GREEN}[2/8] Installing Node.js dependencies...${NC}"
npm install --production=false

# Step 3: Run tests
echo -e "${GREEN}[3/8] Running tests...${NC}"
npm test

# Step 4: SSL certificates
if [[ "$SKIP_SSL" == false ]]; then
  echo -e "${GREEN}[4/8] Setting up SSL certificates...${NC}"

  if [[ ! -f "/etc/ssl/certs/$DOMAIN.crt" || ! -f "/etc/ssl/private/$DOMAIN.key" ]]; then
    echo "SSL certificate not found. Running setup..."
    ./deployment/scripts/generate-ssl-cert.sh
  else
    echo "✓ SSL certificate already exists"
  fi
else
  echo -e "${YELLOW}[4/8] Skipping SSL setup...${NC}"
fi

# Step 5: Nginx configuration
if [[ "$SKIP_NGINX" == false ]]; then
  echo -e "${GREEN}[5/8] Configuring Nginx...${NC}"

  # Copy Nginx config
  sudo cp deployment/nginx/athena.local.conf "$NGINX_AVAILABLE/$DOMAIN.conf"

  # Enable site
  if [[ ! -L "$NGINX_ENABLED/$DOMAIN.conf" ]]; then
    sudo ln -s "$NGINX_AVAILABLE/$DOMAIN.conf" "$NGINX_ENABLED/$DOMAIN.conf"
  fi

  # Test Nginx config
  echo "Testing Nginx configuration..."
  sudo nginx -t

  echo "✓ Nginx configured"
else
  echo -e "${YELLOW}[5/8] Skipping Nginx configuration...${NC}"
fi

# Step 6: Environment configuration
echo -e "${GREEN}[6/8] Setting up environment configuration...${NC}"

sudo mkdir -p "$ENV_DIR"

if [[ ! -f "$ENV_DIR/env" ]]; then
  sudo cp deployment/env.production "$ENV_DIR/env"
  echo "✓ Environment file created at $ENV_DIR/env"
  echo -e "${YELLOW}⚠️  Review and update $ENV_DIR/env if needed${NC}"
else
  echo "✓ Environment file already exists"
fi

# Step 7: Systemd service
if [[ "$SKIP_SYSTEMD" == false ]]; then
  echo -e "${GREEN}[7/8] Configuring systemd service...${NC}"

  # Copy service file
  sudo cp athena-web.service "$SYSTEMD_DIR/athena-web.service"

  # Reload systemd
  sudo systemctl daemon-reload

  # Enable service
  sudo systemctl enable athena-web

  echo "✓ Systemd service configured and enabled"
else
  echo -e "${YELLOW}[7/8] Skipping systemd configuration...${NC}"
fi

# Step 8: Start services
echo -e "${GREEN}[8/8] Starting services...${NC}"

# Start/restart Nginx
if [[ "$SKIP_NGINX" == false ]]; then
  echo "Reloading Nginx..."
  sudo systemctl reload nginx
  echo "✓ Nginx reloaded"
fi

# Start/restart athena-web
if [[ "$SKIP_SYSTEMD" == false ]]; then
  echo "Starting athena-web service..."
  sudo systemctl restart athena-web

  # Wait a moment for service to start
  sleep 2

  # Check status
  if sudo systemctl is-active --quiet athena-web; then
    echo "✓ athena-web service running"
  else
    echo -e "${RED}❌ Error: athena-web service failed to start${NC}"
    echo "Check logs: sudo journalctl -u athena-web -n 50"
    exit 1
  fi
fi

# Final checks
echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo -e "${BLUE}Service Status:${NC}"
sudo systemctl status athena-web --no-pager -l || true

echo ""
echo -e "${BLUE}Access Points:${NC}"
echo "  HTTP:  http://$DOMAIN (redirects to HTTPS)"
echo "  HTTPS: https://$DOMAIN"
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo "  View logs:        sudo journalctl -u athena-web -f"
echo "  Restart service:  sudo systemctl restart athena-web"
echo "  Stop service:     sudo systemctl stop athena-web"
echo "  Service status:   sudo systemctl status athena-web"
echo "  Nginx status:     sudo systemctl status nginx"
echo "  Test Nginx:       sudo nginx -t"
echo ""
echo -e "${YELLOW}⚠️  Next Steps:${NC}"
echo "  1. Verify the service is accessible at https://$DOMAIN"
echo "  2. Check Tailscale connectivity"
echo "  3. Review logs for any warnings"
echo "  4. Update DNS if needed"
echo ""
