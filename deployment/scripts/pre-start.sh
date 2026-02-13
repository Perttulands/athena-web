#!/bin/bash
# Athena Web - Pre-start validation script
# Run before starting the service to ensure everything is ready

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

APP_DIR="$HOME/athena-web"
WORKSPACE_PATH="$HOME/.openclaw/workspace"
LOG_DIR="$APP_DIR/logs"
BACKUP_DIR="$APP_DIR/backups"

echo "=========================================="
echo "Athena Web - Pre-start Checks"
echo "=========================================="

# Check if running as correct user
if [ "$(whoami)" != "perttu" ]; then
    echo -e "${RED}✗ Must run as user 'perttu'${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Running as correct user${NC}"

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 24 ]; then
    echo -e "${RED}✗ Node.js 24.x or higher required (found: $(node --version))${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js version OK ($(node --version))${NC}"

# Check if workspace exists
if [ ! -d "$WORKSPACE_PATH" ]; then
    echo -e "${RED}✗ Workspace directory not found: $WORKSPACE_PATH${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Workspace directory exists${NC}"

# Check if workspace is writable
if [ ! -w "$WORKSPACE_PATH" ]; then
    echo -e "${RED}✗ Workspace directory not writable: $WORKSPACE_PATH${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Workspace directory writable${NC}"

# Create log directory if needed
if [ ! -d "$LOG_DIR" ]; then
    mkdir -p "$LOG_DIR"
    echo -e "${GREEN}✓ Created log directory${NC}"
else
    echo -e "${GREEN}✓ Log directory exists${NC}"
fi

# Create backup directory if needed
if [ ! -d "$BACKUP_DIR" ]; then
    mkdir -p "$BACKUP_DIR"
    echo -e "${GREEN}✓ Created backup directory${NC}"
else
    echo -e "${GREEN}✓ Backup directory exists${NC}"
fi

# Check if environment file exists
if [ -f "/etc/athena-web/env" ] || [ -f "$APP_DIR/.env.production" ]; then
    echo -e "${GREEN}✓ Environment file exists${NC}"
else
    echo -e "${YELLOW}⚠ Production environment file not found${NC}"
    echo -e "${YELLOW}  Create /etc/athena-web/env using deployment/env.production${NC}"
    exit 1
fi

# Check if port 9000 is already in use
if lsof -Pi :9000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Port 9000 is already in use${NC}"
    echo -e "${YELLOW}  This is OK if restarting the service${NC}"
else
    echo -e "${GREEN}✓ Port 9000 is available${NC}"
fi

# Check if node_modules exists
if [ ! -d "$APP_DIR/node_modules" ]; then
    echo -e "${RED}✗ node_modules not found - run 'npm install' first${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Check beads CLI
if ! command -v br &> /dev/null; then
    echo -e "${RED}✗ Beads CLI (br) not found in PATH${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Beads CLI available${NC}"

# Check tmux socket
if [ ! -S "$WORKSPACE_PATH/../tmux" ] && [ ! -S "/tmp/openclaw-coding-agents.sock" ]; then
    echo -e "${YELLOW}⚠ Tmux socket not found - agent integration may not work${NC}"
else
    echo -e "${GREEN}✓ Tmux socket exists${NC}"
fi

# Validate critical files exist
REQUIRED_FILES=(
    "$APP_DIR/server.js"
    "$APP_DIR/package.json"
    "$APP_DIR/public/index.html"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}✗ Required file missing: $file${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✓ All required files present${NC}"

echo "=========================================="
echo -e "${GREEN}All pre-start checks passed!${NC}"
echo "=========================================="

exit 0
