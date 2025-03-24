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

# Run renewal directly with Docker run
echo "Running certificate renewal..."
docker run --rm \
  -v "$(pwd)/data/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/data/certbot/www:/var/www/certbot" \
  --network mysecondbraininfo-be_app-network \
  certbot/certbot:latest renew

# Reload Nginx to use the new certificates
docker compose --env-file $env_file -f docker-compose.production.yml exec nginx nginx -s reload

echo "=== Certificate renewal complete ===" 