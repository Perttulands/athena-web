#!/bin/bash
# Athena Web - Restore script
# Restores application from backup

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
APP_DIR="$HOME/athena-web"
WORKSPACE_PATH="$HOME/.openclaw/workspace"
BACKUP_BASE="$HOME/athena-web/backups"

# Check arguments
if [ $# -eq 0 ]; then
    echo -e "${RED}Usage: $0 <backup_timestamp>${NC}"
    echo ""
    echo "Available backups:"
    ls -1 "$BACKUP_BASE" | grep -E "^[0-9]{8}_[0-9]{6}$" | tail -10
    exit 1
fi

BACKUP_DIR="$BACKUP_BASE/$1"

if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${RED}Backup not found: $BACKUP_DIR${NC}"
    exit 1
fi

echo -e "${BLUE}=========================================="
echo "Athena Web - Restore from Backup"
echo -e "==========================================${NC}"
echo "Backup: $1"
echo ""

# Show manifest
if [ -f "$BACKUP_DIR/manifest.txt" ]; then
    echo -e "${BLUE}Backup contents:${NC}"
    cat "$BACKUP_DIR/manifest.txt"
    echo ""
fi

# Confirmation
echo -e "${YELLOW}WARNING: This will overwrite current configuration!${NC}"
read -p "Are you sure you want to continue? (yes/NO) " -r
echo
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Restore cancelled"
    exit 0
fi

# Stop service if running
if systemctl is-active --quiet athena-web 2>/dev/null; then
    echo -n "Stopping athena-web service... "
    sudo systemctl stop athena-web
    echo -e "${GREEN}✓${NC}"
fi

# Restore function
restore_item() {
    local source="$1"
    local dest="$2"
    local name="$3"

    echo -n "Restoring $name... "
    if [ -f "$source" ]; then
        if [[ "$source" == *.tar.gz ]]; then
            tar -xzf "$source" -C "$(dirname "$dest")" 2>/dev/null
        else
            cp "$source" "$dest" 2>/dev/null
        fi
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}⚠ Not found in backup${NC}"
    fi
}

# Restore environment
if [ -f "$BACKUP_DIR/env.production" ]; then
    restore_item "$BACKUP_DIR/env.production" "$APP_DIR/.env.production" "Environment"
fi

# Restore logs
if [ -f "$BACKUP_DIR/logs.tar.gz" ]; then
    restore_item "$BACKUP_DIR/logs.tar.gz" "$APP_DIR/logs" "Logs"
fi

# Restore workspace
if [ -f "$BACKUP_DIR/workspace.tar.gz" ]; then
    echo -e "${YELLOW}⚠ Workspace restore requires manual review${NC}"
    echo "  Backup location: $BACKUP_DIR/workspace.tar.gz"
    echo "  Extract manually: tar -xzf $BACKUP_DIR/workspace.tar.gz -C $(dirname "$WORKSPACE_PATH")"
fi

# Restore configuration files (requires sudo)
echo ""
echo -e "${BLUE}System configuration files (requires sudo):${NC}"

if [ -f "$BACKUP_DIR/nginx.conf" ]; then
    echo "  Nginx config: sudo cp $BACKUP_DIR/nginx.conf /etc/nginx/sites-available/athena-web.conf"
fi

if [ -f "$BACKUP_DIR/systemd.service" ]; then
    echo "  Systemd service: sudo cp $BACKUP_DIR/systemd.service /etc/systemd/system/athena-web.service"
fi

if [ -f "$BACKUP_DIR/ssl/athena.local.crt" ]; then
    echo "  SSL certificate: sudo cp $BACKUP_DIR/ssl/athena.local.crt /etc/ssl/certs/"
    echo "  SSL key: sudo cp $BACKUP_DIR/ssl/athena.local.key /etc/ssl/private/"
fi

echo ""
echo -e "${GREEN}✅ Application restore completed!${NC}"
echo ""
echo "Next steps:"
echo "  1. Review restored configuration"
echo "  2. Restore system files (see above)"
echo "  3. Start service: sudo systemctl start athena-web"
echo "  4. Check logs: sudo journalctl -u athena-web -f"

exit 0
