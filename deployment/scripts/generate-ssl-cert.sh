#!/bin/bash
# Generate SSL certificate for athena.local
#
# Options:
#   1. Self-signed certificate (for testing)
#   2. Tailscale certificate (recommended for Tailscale network)
#   3. Let's Encrypt (for public access)

set -e

DOMAIN="athena.local"
CERT_DIR="/etc/ssl/certs"
KEY_DIR="/etc/ssl/private"

echo "🔐 SSL Certificate Setup for $DOMAIN"
echo ""
echo "Choose certificate type:"
echo "  1) Self-signed certificate (testing only)"
echo "  2) Tailscale certificate (recommended for Tailscale network)"
echo "  3) Manual setup (bring your own certificate)"
echo ""
read -p "Enter choice [1-3]: " choice

case $choice in
  1)
    echo ""
    echo "📝 Generating self-signed certificate..."
    sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "$KEY_DIR/$DOMAIN.key" \
      -out "$CERT_DIR/$DOMAIN.crt" \
      -subj "/C=FI/ST=Finland/L=Helsinki/O=Athena/CN=$DOMAIN"

    sudo chmod 600 "$KEY_DIR/$DOMAIN.key"
    sudo chmod 644 "$CERT_DIR/$DOMAIN.crt"

    echo "✅ Self-signed certificate created"
    echo "   Certificate: $CERT_DIR/$DOMAIN.crt"
    echo "   Key: $KEY_DIR/$DOMAIN.key"
    echo ""
    echo "⚠️  Your browser will show security warnings for self-signed certificates."
    echo "   This is normal. Add an exception to proceed."
    ;;

  2)
    echo ""
    echo "📝 Using Tailscale certificate..."

    if ! command -v tailscale &> /dev/null; then
      echo "❌ Error: tailscale command not found"
      echo "   Install Tailscale first: https://tailscale.com/download"
      exit 1
    fi

    # Check if we're connected to Tailscale
    if ! tailscale status &> /dev/null; then
      echo "❌ Error: Not connected to Tailscale"
      echo "   Run: sudo tailscale up"
      exit 1
    fi

    echo "Fetching Tailscale certificate for $DOMAIN..."
    sudo tailscale cert "$DOMAIN"

    # Tailscale certs are stored in /var/lib/tailscale/certs by default
    TAILSCALE_CERT="/var/lib/tailscale/certs/$DOMAIN.crt"
    TAILSCALE_KEY="/var/lib/tailscale/certs/$DOMAIN.key"

    if [[ -f "$TAILSCALE_CERT" && -f "$TAILSCALE_KEY" ]]; then
      sudo cp "$TAILSCALE_CERT" "$CERT_DIR/$DOMAIN.crt"
      sudo cp "$TAILSCALE_KEY" "$KEY_DIR/$DOMAIN.key"
      sudo chmod 600 "$KEY_DIR/$DOMAIN.key"
      sudo chmod 644 "$CERT_DIR/$DOMAIN.crt"

      echo "✅ Tailscale certificate installed"
      echo "   Certificate: $CERT_DIR/$DOMAIN.crt"
      echo "   Key: $KEY_DIR/$DOMAIN.key"
    else
      echo "❌ Error: Tailscale certificate not found"
      echo "   Expected at: $TAILSCALE_CERT"
      exit 1
    fi
    ;;

  3)
    echo ""
    echo "📝 Manual certificate setup"
    echo ""
    echo "Place your certificate and key at:"
    echo "   Certificate: $CERT_DIR/$DOMAIN.crt"
    echo "   Private key: $KEY_DIR/$DOMAIN.key"
    echo ""
    echo "Ensure proper permissions:"
    echo "   sudo chmod 644 $CERT_DIR/$DOMAIN.crt"
    echo "   sudo chmod 600 $KEY_DIR/$DOMAIN.key"
    echo "   sudo chown root:root $CERT_DIR/$DOMAIN.crt"
    echo "   sudo chown root:root $KEY_DIR/$DOMAIN.key"
    ;;

  *)
    echo "❌ Invalid choice"
    exit 1
    ;;
esac

echo ""
echo "🔍 Verifying certificate installation..."

if [[ -f "$CERT_DIR/$DOMAIN.crt" && -f "$KEY_DIR/$DOMAIN.key" ]]; then
  echo "✅ Certificate files found"

  # Verify certificate
  echo ""
  echo "Certificate details:"
  sudo openssl x509 -in "$CERT_DIR/$DOMAIN.crt" -noout -subject -issuer -dates

  echo ""
  echo "✅ SSL certificate setup complete!"
  echo ""
  echo "Next steps:"
  echo "  1. Update Nginx configuration if needed"
  echo "  2. Test Nginx config: sudo nginx -t"
  echo "  3. Reload Nginx: sudo systemctl reload nginx"
else
  echo "⚠️  Certificate files not found. Please complete manual setup."
fi
