#!/bin/bash

set -e

# Load variables
domain="${DOMAIN:-api.mysecondbrain.info}"
env_file=".env.ssl"

echo "=== Renewing Let's Encrypt certificates for $domain ==="

# Show existing certificates
if [ -d "./data/certbot/conf/live" ]; then
  echo "Current certificates:"
  ls -la "./data/certbot/conf/live/$domain" || true
  echo "Certificate expiry information:"
  openssl x509 -noout -dates -in "./data/certbot/conf/live/$domain/cert.pem" 2>/dev/null || echo "No certificate found."
fi

# Stop containers to free port 80
echo "Stopping containers for certificate renewal..."
docker compose --env-file $env_file -f docker-compose.production.yml down

# Run renewal using standalone mode
echo "Running certificate renewal in standalone mode..."
docker run --rm \
  -v "$(pwd)/data/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/data/certbot/www:/var/www/certbot" \
  -p 80:80 \
  certbot/certbot:latest renew --standalone --force-renewal

# Restart all services
echo "Restarting services with renewed certificates..."
docker compose --env-file $env_file -f docker-compose.production.yml up -d

echo "=== Certificate renewal complete ===" 