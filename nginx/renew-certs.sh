#!/bin/bash

set -e

# Load variables
domain="${DOMAIN:-api.mysecondbrain.info}"
env_file=".env.ssl"
prod_env_file=".env.production"

echo "=== Renewing Let's Encrypt certificates for $domain ==="

# Check if certificates exist
if [ ! -d "./data/certbot/conf/live/$domain" ]; then
  echo "No certificates found for $domain. Please run init-letsencrypt.sh first."
  exit 1
fi

# Show existing certificate info
echo "Current certificate information:"
openssl x509 -noout -dates -in "./data/certbot/conf/live/$domain/cert.pem" 2>/dev/null || echo "Error reading certificate"

# Stop all containers to free port 80
echo "Stopping containers for certificate renewal..."
docker compose --env-file $env_file --env-file $prod_env_file -f docker-compose.production.yml down

# Run renewal using standalone mode
echo "Running certificate renewal in standalone mode..."
docker run --rm \
  -v "$(pwd)/data/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/data/certbot/www:/var/www/certbot" \
  -p 80:80 \
  --name certbot-renewal \
  certbot/certbot:latest renew --standalone

# Verify renewal
if openssl x509 -checkend 2592000 -noout -in "./data/certbot/conf/live/$domain/cert.pem"; then
  echo "Certificate renewed successfully and is valid for at least 30 days."
  echo "New certificate details:"
  openssl x509 -noout -startdate -enddate -in "./data/certbot/conf/live/$domain/cert.pem"
else
  echo "WARNING: Certificate renewal may have failed. Please check the output above."
fi

# Restart all services
echo "Restarting services with renewed certificates..."
docker compose --env-file $env_file --env-file $prod_env_file -f docker-compose.production.yml up -d

echo "=== Certificate renewal complete ===" 