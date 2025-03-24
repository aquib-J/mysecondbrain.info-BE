#!/bin/bash

set -e

# This script sets up a cron job to automatically renew SSL certificates

# Get the absolute path to the project directory
PROJECT_DIR=$(cd "$(dirname "$0")/.." && pwd)
DOMAIN="${DOMAIN:-api.mysecondbrain.info}"

echo "============================================================="
echo "Setting up automatic certificate renewal for $DOMAIN"
echo "Project directory: $PROJECT_DIR"
echo "============================================================="

# Create the log directory
mkdir -p "$PROJECT_DIR/nginx/logs"

# Make sure the renewal script is executable
chmod +x "$PROJECT_DIR/nginx/renew-certs.sh"

# Create the cron job command - run twice a day at 3:30 AM and 3:30 PM
CRON_CMD="30 3,15 * * * cd $PROJECT_DIR && ./nginx/renew-certs.sh >> $PROJECT_DIR/nginx/logs/renewal.log 2>&1"

# Check if the cron job already exists
EXISTING_CRON=$(crontab -l 2>/dev/null | grep -F "$PROJECT_DIR/nginx/renew-certs.sh")

if [ -n "$EXISTING_CRON" ]; then
    echo "Cron job already exists:"
    echo "$EXISTING_CRON"
    echo "No changes made to crontab."
else
    # Add the cron job
    (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
    
    if [ $? -eq 0 ]; then
        echo "Successfully added cron job for certificate renewal."
        echo "Certificates will be renewed twice a day at 3:30 AM and 3:30 PM."
        echo "Renewal logs will be written to: $PROJECT_DIR/nginx/logs/renewal.log"
    else
        echo "Failed to add cron job."
        exit 1
    fi
fi

# Print current crontab for verification
echo "Current crontab configuration:"
crontab -l | grep -F "$PROJECT_DIR/nginx/renew-certs.sh" || echo "No cron job found in crontab!"

echo "============================================================="
echo "Cron setup complete."
echo "=============================================================" 