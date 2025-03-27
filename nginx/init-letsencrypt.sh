#!/bin/bash

set -e

# Load environment variables or use defaults
email="${EMAIL:-aquib.jansher@gmail.com}"
domain="${DOMAIN:-api.mysecondbrain.info}"
staging=${STAGING:-0}
env_file=".env.ssl"
prod_env_file=".env.production"

echo "=== Starting SSL certificate setup for $domain ==="

# Create required directories
mkdir -p "./data/certbot/conf"
mkdir -p "./data/certbot/www"

# Check if we already have a certificate
if [ -f "./data/certbot/conf/live/$domain/cert.pem" ]; then
  echo "Certificate exists. Checking validity..."
  if openssl x509 -checkend 2592000 -noout -in "./data/certbot/conf/live/$domain/cert.pem"; then
    echo "Certificate is still valid for at least 30 days."
    exit 0
  else
    echo "Certificate is expiring soon or invalid. Will renew..."
  fi
fi

# Ensure all containers are stopped to free port 80
echo "Stopping any existing containers..."
docker compose --env-file $env_file --env-file $prod_env_file -f docker-compose.production.yml down 2>/dev/null || true

# Set staging parameter if needed
staging_arg=""
[ "$staging" = "1" ] && staging_arg="--staging"

echo "Requesting Let's Encrypt certificate using standalone mode..."
docker run --rm \
  -v "$(pwd)/data/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/data/certbot/www:/var/www/certbot" \
  -p 80:80 \
  --name certbot-initial \
  certbot/certbot:latest certonly --standalone \
  $staging_arg \
  --email $email \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  -d $domain

# Verify the certificate was created
if [ -f "./data/certbot/conf/live/$domain/fullchain.pem" ]; then
  echo "Certificate successfully obtained!"
  echo "Certificate details:"
  openssl x509 -noout -text -in "./data/certbot/conf/live/$domain/cert.pem" | grep -E "Subject:|Not Before:|Not After :"
else
  echo "ERROR: Certificate was not obtained. Please check the logs above for errors."
  exit 1
fi

# Start services with the new certificate
echo "Starting services with new certificate..."
docker compose --env-file $env_file --env-file $prod_env_file -f docker-compose.production.yml up -d

echo "=== Let's Encrypt setup complete for $domain ==="
echo "Your site should now be available at https://$domain" 