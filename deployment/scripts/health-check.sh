#!/bin/bash
# Health check script for Athena Web
#
# Usage:
#   ./health-check.sh [--url https://athena.local] [--slack-webhook URL]
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
URL="https://athena.local"
SLACK_WEBHOOK=""
FAILED=0
APP_DIR="${APP_DIR:-$HOME/athena-web}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --url)
      URL="$2"
      shift 2
      ;;
    --slack-webhook)
      SLACK_WEBHOOK="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}🦉 Athena Web Health Check${NC}"
echo -e "${BLUE}===========================${NC}"
echo ""

# Function to notify Slack
notify_slack() {
  local message="$1"
  local status="$2"

  if [[ -n "$SLACK_WEBHOOK" ]]; then
    local color="good"
    [[ "$status" == "error" ]] && color="danger"
    [[ "$status" == "warning" ]] && color="warning"

    curl -s -X POST "$SLACK_WEBHOOK" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"$message\",\"color\":\"$color\"}" > /dev/null
  fi
}

# Check 1: Systemd service status
echo -n "Checking systemd service... "
if sudo systemctl is-active --quiet athena-web; then
  echo -e "${GREEN}✓ Running${NC}"
else
  echo -e "${RED}✗ Not running${NC}"
  FAILED=1
  notify_slack "❌ Athena Web service is not running on $(hostname)" "error"
fi

# Check 2: Process running
echo -n "Checking process... "
if pgrep -f "node server.js" > /dev/null; then
  PID=$(pgrep -f "node server.js")
  echo -e "${GREEN}✓ Running (PID: $PID)${NC}"
else
  echo -e "${RED}✗ Process not found${NC}"
  FAILED=1
fi

# Check 3: Port listening
echo -n "Checking port 9000... "
if sudo ss -tlnp | grep -q :9000; then
  echo -e "${GREEN}✓ Listening${NC}"
else
  echo -e "${RED}✗ Not listening${NC}"
  FAILED=1
fi

# Check 4: Nginx status
echo -n "Checking Nginx... "
if sudo systemctl is-active --quiet nginx; then
  echo -e "${GREEN}✓ Running${NC}"
else
  echo -e "${RED}✗ Not running${NC}"
  FAILED=1
fi

# Check 5: Nginx configuration
echo -n "Checking Nginx config... "
if sudo nginx -t &> /dev/null; then
  echo -e "${GREEN}✓ Valid${NC}"
else
  echo -e "${RED}✗ Invalid${NC}"
  FAILED=1
fi

# Check 6: SSL certificate
echo -n "Checking SSL certificate... "
if [[ -f "/etc/ssl/certs/athena.local.crt" && -f "/etc/ssl/private/athena.local.key" ]]; then
  # Check expiration
  EXPIRY=$(sudo openssl x509 -in /etc/ssl/certs/athena.local.crt -noout -enddate | cut -d= -f2)
  EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s)
  NOW_EPOCH=$(date +%s)
  DAYS_LEFT=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))

  if [[ $DAYS_LEFT -lt 0 ]]; then
    echo -e "${RED}✗ Expired${NC}"
    FAILED=1
    notify_slack "❌ SSL certificate expired on $(hostname)" "error"
  elif [[ $DAYS_LEFT -lt 7 ]]; then
    echo -e "${YELLOW}⚠ Expires in $DAYS_LEFT days${NC}"
    notify_slack "⚠️ SSL certificate expires in $DAYS_LEFT days on $(hostname)" "warning"
  else
    echo -e "${GREEN}✓ Valid (expires in $DAYS_LEFT days)${NC}"
  fi
else
  echo -e "${RED}✗ Not found${NC}"
  FAILED=1
fi

# Check 7: Health endpoint
echo -n "Checking health endpoint... "
HTTP_CODE=$(curl -k -s -o /dev/null -w "%{http_code}" "$URL/api/health" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "200" ]]; then
  echo -e "${GREEN}✓ Responding (HTTP $HTTP_CODE)${NC}"
else
  echo -e "${RED}✗ Not responding (HTTP $HTTP_CODE)${NC}"
  FAILED=1
  notify_slack "❌ Athena Web health endpoint failing (HTTP $HTTP_CODE) on $(hostname)" "error"
fi

# Check 8: Response time
echo -n "Checking response time... "
RESPONSE_TIME=$(curl -k -s -o /dev/null -w "%{time_total}" "$URL/api/health" 2>/dev/null || echo "0")
RESPONSE_MS=$(echo "$RESPONSE_TIME * 1000" | bc | cut -d. -f1)

if [[ $RESPONSE_MS -lt 1000 ]]; then
  echo -e "${GREEN}✓ ${RESPONSE_MS}ms${NC}"
elif [[ $RESPONSE_MS -lt 3000 ]]; then
  echo -e "${YELLOW}⚠ ${RESPONSE_MS}ms (slow)${NC}"
else
  echo -e "${RED}✗ ${RESPONSE_MS}ms (very slow)${NC}"
  FAILED=1
fi

# Check 9: Memory usage
echo -n "Checking memory usage... "
if pgrep -f "node server.js" > /dev/null; then
  PID=$(pgrep -f "node server.js")
  MEM_KB=$(ps -p $PID -o rss= 2>/dev/null || echo "0")
  MEM_MB=$((MEM_KB / 1024))

  if [[ $MEM_MB -lt 512 ]]; then
    echo -e "${GREEN}✓ ${MEM_MB}MB${NC}"
  elif [[ $MEM_MB -lt 1024 ]]; then
    echo -e "${YELLOW}⚠ ${MEM_MB}MB${NC}"
  else
    echo -e "${RED}✗ ${MEM_MB}MB (high)${NC}"
  fi
else
  echo -e "${RED}✗ Process not running${NC}"
fi

# Check 10: Disk space
echo -n "Checking disk space... "
DISK_USAGE=$(df -h "$APP_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')

if [[ $DISK_USAGE -lt 80 ]]; then
  echo -e "${GREEN}✓ ${DISK_USAGE}% used${NC}"
elif [[ $DISK_USAGE -lt 90 ]]; then
  echo -e "${YELLOW}⚠ ${DISK_USAGE}% used${NC}"
else
  echo -e "${RED}✗ ${DISK_USAGE}% used (critical)${NC}"
  FAILED=1
  notify_slack "⚠️ Disk space critical (${DISK_USAGE}% used) on $(hostname)" "warning"
fi

# Check 11: Tailscale connectivity
echo -n "Checking Tailscale... "
if command -v tailscale &> /dev/null; then
  if tailscale status &> /dev/null; then
    echo -e "${GREEN}✓ Connected${NC}"
  else
    echo -e "${RED}✗ Not connected${NC}"
    FAILED=1
  fi
else
  echo -e "${YELLOW}⚠ Not installed${NC}"
fi

# Summary
echo ""
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}=======${NC}"

if [[ $FAILED -eq 0 ]]; then
  echo -e "${GREEN}✅ All checks passed${NC}"
  exit 0
else
  echo -e "${RED}❌ Some checks failed${NC}"
  echo ""
  echo "Troubleshooting:"
  echo "  - Check logs: sudo journalctl -u athena-web -n 50"
  echo "  - Check status: sudo systemctl status athena-web"
  echo "  - Restart service: sudo systemctl restart athena-web"
  exit 1
fi
