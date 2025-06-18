#!/bin/bash

# Backup service entrypoint script
set -e

echo "Starting AUSTA Cockpit Backup Service"

# Create cron job from environment variable
if [ ! -z "$BACKUP_SCHEDULE" ]; then
    echo "Setting up backup schedule: ${BACKUP_SCHEDULE}"
    echo "${BACKUP_SCHEDULE} /scripts/backup-all.sh >> /logs/backup.log 2>&1" > /etc/crontabs/backup
else
    # Default: Daily at 2 AM
    echo "Using default backup schedule: Daily at 2 AM"
    echo "0 2 * * * /scripts/backup-all.sh >> /logs/backup.log 2>&1" > /etc/crontabs/backup
fi

# Add health check cron
echo "*/5 * * * * echo 'Backup service healthy' > /tmp/health" >> /etc/crontabs/backup

# Ensure log file exists
touch /logs/backup.log

# Run initial backup on startup if requested
if [ "$RUN_BACKUP_ON_STARTUP" = "true" ]; then
    echo "Running initial backup..."
    /scripts/backup-all.sh
fi

echo "Backup service ready. Starting cron daemon..."

# Start cron daemon in foreground
exec "$@"