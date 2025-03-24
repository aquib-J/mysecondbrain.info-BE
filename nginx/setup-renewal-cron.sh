#!/bin/bash

# Path to the renewal script
RENEWAL_SCRIPT="$(pwd)/nginx/renew-certs.sh"
LOG_FILE="$(pwd)/nginx/logs/renewal.log"

# Ensure the logs directory exists
mkdir -p "$(pwd)/nginx/logs"

# Make the renewal script executable
chmod +x "$RENEWAL_SCRIPT"

# Set up a monthly cron job for certificate renewal
(crontab -l 2>/dev/null || echo "") | grep -v "$RENEWAL_SCRIPT" | { 
  cat
  echo "0 0 1 * * cd $(pwd) && $RENEWAL_SCRIPT >> $LOG_FILE 2>&1"
} | crontab -

echo "Certificate renewal cron job has been scheduled to run monthly." 