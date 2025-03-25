#!/bin/bash

set -e

# Load environment variables or use defaults
email="${EMAIL:-aquib.jansher@gmail.com}"
domain="${DOMAIN:-api.mysecondbrain.info}"
staging=${STAGING:-0}
env_file=".env.ssl"

echo "=== Starting SSL certificate setup for $domain ==="

# Create required directories with proper permissions
mkdir -p "./data/certbot/www/.well-known/acme-challenge"
mkdir -p "./data/certbot/conf/live/$domain"
chmod -R 755 "./data/certbot/www"

# Create a test challenge file to verify Nginx configuration
echo "Creating test challenge file..."
echo "This is a test file for ACME challenge" > "./data/certbot/www/.well-known/acme-challenge/test.txt"
ls -la "./data/certbot/www/.well-known/acme-challenge/"

# Create temporary self-signed certificate if needed
if [ ! -f "./data/certbot/conf/live/$domain/privkey.pem" ]; then
  echo "Creating temporary self-signed certificates..."
  openssl req -x509 -nodes -newkey rsa:4096 -days 1 \
    -keyout "./data/certbot/conf/live/$domain/privkey.pem" \
    -out "./data/certbot/conf/live/$domain/fullchain.pem" \
    -subj "/CN=$domain"
fi

# Ensure Nginx is stopped
echo "Stopping any existing containers..."
docker compose --env-file $env_file -f docker-compose.production.yml down

# Start Nginx for domain validation
echo "Starting Nginx for Let's Encrypt validation..."
docker compose --env-file $env_file -f docker-compose.production.yml up -d nginx
sleep 10

# Verify Nginx configuration
echo "Checking Nginx configuration..."
docker compose --env-file $env_file -f docker-compose.production.yml exec nginx nginx -T

# Check if Nginx is serving the challenge directory correctly
echo "Testing ACME challenge path..."
docker compose --env-file $env_file -f docker-compose.production.yml exec nginx curl -I http://localhost/.well-known/acme-challenge/test.txt
echo "Testing from host..."
curl -I http://$domain/.well-known/acme-challenge/test.txt || true

# Use standalone mode instead if webroot is not working
echo "Requesting Let's Encrypt certificate using standalone mode..."
staging_arg=""
[ "$staging" = "1" ] && staging_arg="--staging"

# Stop Nginx to free up port 80
docker compose --env-file $env_file -f docker-compose.production.yml down

# Run certbot in standalone mode
docker run --rm \
  -v "$(pwd)/data/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/data/certbot/www:/var/www/certbot" \
  -p 80:80 \
  certbot/certbot:latest certonly --standalone \
  $staging_arg \
  --email $email \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  -d $domain

# Start services with the new certificate
echo "Starting services with new certificate..."
docker compose --env-file $env_file -f docker-compose.production.yml up -d

echo "=== Let's Encrypt setup complete for $domain ===" 