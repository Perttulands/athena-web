#!/bin/bash
# Athena Web - SSL Certificate Setup Script
# Generates self-signed certificates for Tailscale internal use

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

CERT_DIR="/etc/ssl/certs"
KEY_DIR="/etc/ssl/private"
DOMAIN="athena.local"
DAYS=3650  # 10 years for internal cert

echo -e "${BLUE}=========================================="
echo "SSL Certificate Setup for Athena Web"
echo -e "==========================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (sudo)${NC}"
    exit 1
fi

# Check if certificates already exist
if [ -f "$CERT_DIR/$DOMAIN.crt" ] && [ -f "$KEY_DIR/$DOMAIN.key" ]; then
    echo -e "${YELLOW}Certificates already exist${NC}"
    read -p "Do you want to regenerate them? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "SSL setup cancelled"
        exit 0
    fi
fi

echo -e "${BLUE}Generating self-signed certificate...${NC}"

# Create private key
openssl genrsa -out "$KEY_DIR/$DOMAIN.key" 2048

# Create certificate signing request config
cat > /tmp/openssl.cnf << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=US
ST=State
L=City
O=OpenClaw
OU=Development
CN=$DOMAIN

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = *.$DOMAIN
DNS.3 = localhost
IP.1 = 127.0.0.1
IP.2 = 100.64.0.0/10
EOF

# Generate certificate
openssl req -new -x509 -key "$KEY_DIR/$DOMAIN.key" \
    -out "$CERT_DIR/$DOMAIN.crt" \
    -days $DAYS \
    -config /tmp/openssl.cnf \
    -extensions v3_req

# Set proper permissions
chmod 600 "$KEY_DIR/$DOMAIN.key"
chmod 644 "$CERT_DIR/$DOMAIN.crt"

# Clean up
rm /tmp/openssl.cnf

echo ""
echo -e "${GREEN}✓ Certificate generated successfully${NC}"
echo ""
echo "Certificate details:"
openssl x509 -in "$CERT_DIR/$DOMAIN.crt" -noout -subject -dates
echo ""
echo -e "${BLUE}Certificate locations:${NC}"
echo "  Certificate: $CERT_DIR/$DOMAIN.crt"
echo "  Private key: $KEY_DIR/$DOMAIN.key"
echo ""
echo -e "${YELLOW}Note: This is a self-signed certificate for internal use.${NC}"
echo -e "${YELLOW}Browsers will show a warning - this is expected.${NC}"
echo ""
echo -e "${BLUE}For production with real domain, consider Let's Encrypt:${NC}"
echo "  sudo certbot --nginx -d yourdomain.com"
echo ""
echo -e "${GREEN}✅ SSL setup complete!${NC}"
