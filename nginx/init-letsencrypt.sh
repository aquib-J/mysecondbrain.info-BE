#!/bin/bash

set -e

# Load environment variables or use defaults
email="${EMAIL:-aquib.jansher@gmail.com}"
domain="${DOMAIN:-api.mysecondbrain.info}"
staging=${STAGING:-0}
env_file=".env.ssl"

echo "=== Starting SSL certificate setup for $domain ==="

# Create required directories
mkdir -p "./data/certbot/www"
mkdir -p "./data/certbot/conf/live/$domain"

# Create temporary self-signed certificate
if [ ! -f "./data/certbot/conf/live/$domain/privkey.pem" ]; then
  echo "Creating temporary self-signed certificates..."
  openssl req -x509 -nodes -newkey rsa:4096 -days 1 \
    -keyout "./data/certbot/conf/live/$domain/privkey.pem" \
    -out "./data/certbot/conf/live/$domain/fullchain.pem" \
    -subj "/CN=$domain"
fi

# Create temporary override for local paths
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

# Start Nginx for domain validation
echo "Starting Nginx for Let's Encrypt validation..."
docker compose --env-file $env_file -f docker-compose.production.yml -f docker-compose.override.yml up -d nginx
sleep 5

# Get the certificate
echo "Requesting Let's Encrypt certificate..."
staging_arg=""
[ "$staging" = "1" ] && staging_arg="--staging"

docker compose --env-file $env_file -f docker-compose.production.yml -f docker-compose.override.yml run --rm \
  certbot certonly --webroot -w /var/www/certbot \
  $staging_arg \
  --email $email \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  -d $domain

# Restart with the new certificate
echo "Restarting services with new certificate..."
docker compose --env-file $env_file -f docker-compose.production.yml -f docker-compose.override.yml down
rm docker-compose.override.yml
docker compose --env-file $env_file -f docker-compose.production.yml up -d

echo "=== Let's Encrypt setup complete for $domain ===" 