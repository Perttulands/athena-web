#!/bin/bash
# Athena Web - Production startup script
# Starts the service with health checks and monitoring

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

APP_DIR="$HOME/athena-web"
SERVICE_NAME="athena-web"

cd "$APP_DIR"

echo -e "${BLUE}=========================================="
echo "Athena Web - Production Startup"
echo -e "==========================================${NC}"
echo ""

# Check if already running
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo -e "${YELLOW}Service is already running${NC}"
    read -p "Do you want to restart it? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Restarting service...${NC}"
        sudo systemctl restart "$SERVICE_NAME"
    else
        echo "Startup cancelled"
        exit 0
    fi
else
    echo -e "${BLUE}Starting service...${NC}"
    sudo systemctl start "$SERVICE_NAME"
fi

# Wait for service to start
echo -n "Waiting for service to be ready"
for i in {1..10}; do
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        echo ""
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# Check if service started successfully
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    echo -e "${RED}✗ Service failed to start${NC}"
    echo ""
    echo "Recent logs:"
    sudo journalctl -u "$SERVICE_NAME" -n 20 --no-pager
    exit 1
fi

echo -e "${GREEN}✓ Service started${NC}"
echo ""

# Wait for health check
echo -n "Waiting for health check"
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -sf http://127.0.0.1:9000/health > /dev/null 2>&1; then
        echo ""
        echo -e "${GREEN}✓ Health check passed${NC}"
        break
    fi
    echo -n "."
    sleep 1
    ATTEMPT=$((ATTEMPT + 1))
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo ""
    echo -e "${RED}✗ Health check timeout${NC}"
    echo ""
    echo "Recent logs:"
    sudo journalctl -u "$SERVICE_NAME" -n 20 --no-pager
    exit 1
fi

echo ""
echo -e "${BLUE}Service Information:${NC}"
echo "  Status: $(systemctl is-active "$SERVICE_NAME")"
echo "  URL: https://athena.local"
echo "  Local: http://127.0.0.1:9000"
echo ""
echo -e "${BLUE}Useful commands:${NC}"
echo "  Status:  sudo systemctl status $SERVICE_NAME"
echo "  Logs:    sudo journalctl -u $SERVICE_NAME -f"
echo "  Stop:    sudo systemctl stop $SERVICE_NAME"
echo "  Restart: sudo systemctl restart $SERVICE_NAME"
echo ""
echo -e "${GREEN}✅ Athena Web is running!${NC}"
