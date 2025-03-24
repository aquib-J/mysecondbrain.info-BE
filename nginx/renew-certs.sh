#!/bin/bash

set -e

# Domain for Let's Encrypt - allow override with environment variables
domain="${DOMAIN:-api.mysecondbrain.info}"
env_file="${ENV_FILE:-.env.ssl}"

echo "============================================================="
echo "Renewing Let's Encrypt certificates for $domain..."
echo "Using environment file: $env_file"
echo "============================================================="

# Run certbot renewal
if [ -f "$env_file" ]; then
  echo "Using environment file: $env_file"
  
  # Check for required files before renewal
  if ! docker compose --env-file $env_file -f docker-compose.production.yml ps | grep -q "nginx.*running"; then
    echo "WARNING: Nginx container is not running. Starting it now..."
    docker compose --env-file $env_file -f docker-compose.production.yml up -d nginx
    echo "Waiting for Nginx to start..."
    sleep 10
  fi
  
  echo "Running certificate renewal..."
  
  # For certificate renewal, we need to ensure our volumes match
  # This avoids permissions issues with Docker-managed volumes
  if [ -d "./data/certbot" ]; then
    echo "Using local certificate directory for renewal"
    
    # Create temporary override file
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
    
    # Run renewal with override
    docker compose --env-file $env_file -f docker-compose.production.yml -f docker-compose.override.yml run --rm \
      certbot renew --force-renewal
      
    renewal_exit_code=$?
    
    # Clean up override
    rm docker-compose.override.yml
  else
    # Use standard volumes if local directory doesn't exist
    docker compose --env-file $env_file -f docker-compose.production.yml run --rm \
      certbot renew --force-renewal
      
    renewal_exit_code=$?
  fi
  
  if [ $renewal_exit_code -ne 0 ]; then
    echo "WARNING: Certificate renewal returned exit code $renewal_exit_code"
  fi
else
  echo "Environment file not found, using default environment"
  echo "This may cause issues if your domain is not the default."
  
  docker compose -f docker-compose.production.yml run --rm \
    certbot renew --force-renewal
    
  renewal_exit_code=$?
  if [ $renewal_exit_code -ne 0 ]; then
    echo "WARNING: Certificate renewal returned exit code $renewal_exit_code"
  fi
fi

# Reload Nginx to use the new certificates
echo "Reloading Nginx to use new certificates..."
if [ -f "$env_file" ]; then
  docker compose --env-file $env_file -f docker-compose.production.yml exec nginx nginx -s reload
  
  reload_exit_code=$?
  if [ $reload_exit_code -ne 0 ]; then
    echo "ERROR: Failed to reload Nginx, exit code: $reload_exit_code"
    echo "Check if the certificates were properly renewed and Nginx configuration is valid."
    exit $reload_exit_code
  fi
else
  docker compose -f docker-compose.production.yml exec nginx nginx -s reload
  
  reload_exit_code=$?
  if [ $reload_exit_code -ne 0 ]; then
    echo "ERROR: Failed to reload Nginx, exit code: $reload_exit_code"
    exit $reload_exit_code
  fi
fi

echo "============================================================="
echo "Certificate renewal complete for $domain."
echo "=============================================================" 