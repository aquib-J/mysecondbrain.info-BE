#!/bin/bash

set -e

# Email and domain for Let's Encrypt - allow override with environment variables
email="${EMAIL:-aquib.jansher@gmail.com}"
domain="${DOMAIN:-api.mysecondbrain.info}"
rsa_key_size=4096
staging=${STAGING:-0} # Set to 1 if you're testing your setup to avoid hitting request limits

echo "============================================================="
echo "Initializing Let's Encrypt for domain: $domain with email: $email"
echo "============================================================="

# Check if domain is valid
if [[ ! "$domain" =~ ^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$ ]]; then
  echo "WARNING: Domain '$domain' doesn't appear to be a valid domain name."
  echo "This might cause certificate issuance to fail."
  echo "If you're running in a CI environment, make sure to set DOMAIN properly."
  # Continue anyway - Let's Encrypt will validate
fi

# Create Docker network if not exists
if ! docker network ls | grep -q app-network; then
  echo "Creating Docker network: app-network"
  docker network create app-network
fi

# Create directories for certbot
echo "Creating directories for Certbot..."
mkdir -p "./data/certbot/www"
mkdir -p "./data/certbot/conf/live/$domain"

# Create temporary self-signed certificate for Nginx to start
if [ ! -f "./data/certbot/conf/live/$domain/privkey.pem" ]; then
  echo "Creating temporary self-signed certificates..."
  openssl req -x509 -nodes -newkey rsa:$rsa_key_size -days 1 \
    -keyout "./data/certbot/conf/live/$domain/privkey.pem" \
    -out "./data/certbot/conf/live/$domain/fullchain.pem" \
    -subj "/CN=$domain" \
    -addext "subjectAltName=DNS:$domain"
  echo "Temporary certificates created."
else
  echo "Using existing temporary certificates."
fi

# Create a .env file for docker-compose
env_file=".env.ssl"
echo "Creating environment file: $env_file"
echo "DOMAIN=$domain" > $env_file
echo "EMAIL=$email" >> $env_file
echo "STAGING=$staging" >> $env_file

# Ensure nginx template directory exists
if [ ! -d "./nginx/templates" ]; then
  echo "ERROR: nginx/templates directory not found."
  echo "Make sure you've set up the repository correctly."
  exit 1
fi

# Check if nginx template exists
if [ ! -f "./nginx/templates/nginx.conf.template" ]; then
  echo "ERROR: nginx.conf.template not found in nginx/templates directory."
  echo "Make sure you've set up the repository correctly."
  exit 1
fi

# Modify docker-compose.yml to use local volumes for initial setup
echo "Creating temporary Docker Compose override for initial setup..."
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

echo "Starting Nginx container for initial setup..."
# Start Nginx container with temporary certificates
docker compose --env-file $env_file -f docker-compose.production.yml -f docker-compose.override.yml up -d nginx

# Wait for Nginx to start
echo "Waiting for Nginx to start..."
sleep 10

# Check if Nginx is running
if ! docker compose --env-file $env_file -f docker-compose.production.yml -f docker-compose.override.yml ps | grep -q "nginx.*running"; then
  echo "ERROR: Nginx container failed to start. Check docker logs for details:"
  docker compose --env-file $env_file -f docker-compose.production.yml -f docker-compose.override.yml logs nginx
  rm docker-compose.override.yml
  exit 1
fi

echo "Requesting Let's Encrypt certificates..."
# Request Let's Encrypt certificates
if [ $staging != "0" ]; then 
  staging_arg="--staging"
  echo "Using Let's Encrypt staging environment."
else
  echo "Using Let's Encrypt production environment."
fi

docker compose --env-file $env_file -f docker-compose.production.yml -f docker-compose.override.yml run --rm \
  certbot certonly --webroot -w /var/www/certbot \
  $staging_arg \
  --email $email \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  -d $domain

# Reload Nginx to use the new certificates
echo "Reloading Nginx to use new certificates..."
docker compose --env-file $env_file -f docker-compose.production.yml -f docker-compose.override.yml exec nginx nginx -s reload

echo "Stopping containers to switch to Docker volumes..."
docker compose --env-file $env_file -f docker-compose.production.yml -f docker-compose.override.yml down

# Remove the temporary override
rm docker-compose.override.yml

echo "Certificate setup complete! Starting full application with Docker volumes..."
# Start the full application with proper Docker volumes
docker compose --env-file $env_file -f docker-compose.production.yml up -d

echo "============================================================="
echo "Let's Encrypt setup complete for $domain"
echo "Auto-renewal is configured to run twice a day"
echo "Environment file created at: $env_file"
echo "=============================================================" 