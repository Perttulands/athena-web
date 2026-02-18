#!/bin/bash
# Athena Web - Backup script
# Backs up application state, configuration, and workspace data

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
APP_DIR="$HOME/athena-web"
WORKSPACE_PATH="$HOME/athena"
BACKUP_BASE="$HOME/athena-web/backups"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_BASE/$TIMESTAMP"

echo -e "${BLUE}=========================================="
echo "Athena Web - Backup"
echo -e "==========================================${NC}"
echo "Timestamp: $TIMESTAMP"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup function with progress
backup_item() {
    local source="$1"
    local dest="$2"
    local name="$3"

    echo -n "Backing up $name... "
    if [ -e "$source" ]; then
        if [ -d "$source" ]; then
            tar -czf "$dest" -C "$(dirname "$source")" "$(basename "$source")" 2>/dev/null
        else
            cp "$source" "$dest" 2>/dev/null
        fi
        local size=$(du -h "$dest" | cut -f1)
        echo -e "${GREEN}✓ ($size)${NC}"
    else
        echo -e "${YELLOW}⚠ Not found, skipping${NC}"
    fi
}

# Application configuration
backup_item "$APP_DIR/.env.production" "$BACKUP_DIR/env.production" "Environment"
backup_item "$APP_DIR/package.json" "$BACKUP_DIR/package.json" "Package config"
backup_item "$APP_DIR/package-lock.json" "$BACKUP_DIR/package-lock.json" "Package lock"

# Application logs
if [ -d "$APP_DIR/logs" ]; then
    backup_item "$APP_DIR/logs" "$BACKUP_DIR/logs.tar.gz" "Application logs"
fi

# Workspace data
if [ -d "$WORKSPACE_PATH" ]; then
    echo -n "Backing up workspace... "
    tar -czf "$BACKUP_DIR/workspace.tar.gz" \
        -C "$(dirname "$WORKSPACE_PATH")" \
        "$(basename "$WORKSPACE_PATH")" \
        --exclude="*.tmp" \
        --exclude="*.sock" \
        --exclude=".git" \
        2>/dev/null || true
    local size=$(du -h "$BACKUP_DIR/workspace.tar.gz" | cut -f1)
    echo -e "${GREEN}✓ ($size)${NC}"
fi

# Nginx configuration (if exists)
if [ -f "/etc/nginx/sites-available/athena-web.conf" ]; then
    backup_item "/etc/nginx/sites-available/athena-web.conf" "$BACKUP_DIR/nginx.conf" "Nginx config"
fi

# Systemd service file (if exists)
if [ -f "/etc/systemd/system/athena-web.service" ]; then
    backup_item "/etc/systemd/system/athena-web.service" "$BACKUP_DIR/systemd.service" "Systemd service"
fi

# SSL certificates (if exists)
if [ -f "/etc/ssl/certs/athena.local.crt" ]; then
    mkdir -p "$BACKUP_DIR/ssl"
    backup_item "/etc/ssl/certs/athena.local.crt" "$BACKUP_DIR/ssl/athena.local.crt" "SSL certificate"
    backup_item "/etc/ssl/private/athena.local.key" "$BACKUP_DIR/ssl/athena.local.key" "SSL private key"
fi

# Create manifest
cat > "$BACKUP_DIR/manifest.txt" << EOF
Athena Web Backup
================

Timestamp: $TIMESTAMP
Date: $(date)
Hostname: $(hostname)
User: $(whoami)

Contents:
EOF

find "$BACKUP_DIR" -type f -exec ls -lh {} \; | awk '{print $9, "(" $5 ")"}' >> "$BACKUP_DIR/manifest.txt"

# Calculate total size
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)

echo ""
echo -e "${BLUE}Backup Summary:${NC}"
echo "  Location: $BACKUP_DIR"
echo "  Total size: $TOTAL_SIZE"
echo ""

# Cleanup old backups
echo -n "Cleaning up old backups (>$RETENTION_DAYS days)... "
DELETED_COUNT=0
while IFS= read -r -d '' backup; do
    if [ -d "$backup" ]; then
        rm -rf "$backup"
        DELETED_COUNT=$((DELETED_COUNT + 1))
    fi
done < <(find "$BACKUP_BASE" -maxdepth 1 -type d -mtime +$RETENTION_DAYS -print0 2>/dev/null)

if [ $DELETED_COUNT -gt 0 ]; then
    echo -e "${GREEN}✓ Removed $DELETED_COUNT old backup(s)${NC}"
else
    echo -e "${GREEN}✓ No old backups to remove${NC}"
fi

# List recent backups
echo ""
echo -e "${BLUE}Recent backups:${NC}"
ls -lh "$BACKUP_BASE" | grep "^d" | tail -5 | awk '{print "  " $9, "(" $5 ")"}'

echo ""
echo -e "${GREEN}✅ Backup completed successfully!${NC}"

# Optional: Send notification
if [ -n "${BACKUP_WEBHOOK_URL:-}" ]; then
    curl -s -X POST "$BACKUP_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{\"text\":\"✅ Athena Web backup completed: $TOTAL_SIZE\"}" > /dev/null || true
fi

exit 0
