#!/bin/bash

set -e

# Load variables
domain="${DOMAIN:-api.mysecondbrain.info}"
env_file=".env.ssl"

echo "=== Renewing Let's Encrypt certificates for $domain ==="

# Make sure Nginx is running for validation
if ! docker compose --env-file $env_file -f docker-compose.production.yml ps | grep -q "nginx.*running"; then
  echo "Starting Nginx container..."
  docker compose --env-file $env_file -f docker-compose.production.yml up -d nginx
  sleep 5
fi

# Create temporary override for local certificates
cat > docker-compose.override.yml <<EOF
version: '3'
services:
  nginx:
    volumes:
      - ./data/certbot/conf:/etc/letsencrypt
      - ./data/certbot/www:/var/www/certbot
  certbot:
    volumes:
      - ./data/certbot/conf:/etc/letsencrypt
      - ./data/certbot/www:/var/www/certbot
EOF

# Run renewal
echo "Running certificate renewal..."
docker compose --env-file $env_file -f docker-compose.production.yml -f docker-compose.override.yml run --rm \
  certbot renew

# Reload Nginx to use the new certificates
docker compose --env-file $env_file -f docker-compose.production.yml exec nginx nginx -s reload

# Clean up
rm docker-compose.override.yml

echo "=== Certificate renewal complete ===" 