#!/bin/bash

# PostgreSQL Backup Script
set -e

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres"
BACKUP_FILE="postgres_backup_${TIMESTAMP}.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

echo "Starting PostgreSQL backup at $(date)"

# Parse DATABASE_URL
if [[ $DATABASE_URL =~ postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/(.+) ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASS="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[4]}"
    DB_NAME="${BASH_REMATCH[5]}"
else
    echo "Error: Invalid DATABASE_URL format"
    exit 1
fi

# Set PostgreSQL password
export PGPASSWORD="${DB_PASS}"

# Perform backup
pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
    --verbose --no-owner --no-acl --clean --if-exists \
    | gzip > "${BACKUP_DIR}/${BACKUP_FILE}"

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "PostgreSQL backup completed successfully: ${BACKUP_FILE}"
    
    # Upload to S3 if configured
    if [ ! -z "$S3_BUCKET" ]; then
        echo "Uploading to S3..."
        aws s3 cp "${BACKUP_DIR}/${BACKUP_FILE}" "s3://${S3_BUCKET}/postgres/${BACKUP_FILE}"
        
        if [ $? -eq 0 ]; then
            echo "Upload to S3 completed successfully"
        else
            echo "Error: Failed to upload to S3"
            exit 1
        fi
    fi
    
    # Clean up old local backups (keep last 7 days)
    find "${BACKUP_DIR}" -name "postgres_backup_*.sql.gz" -mtime +7 -delete
    
else
    echo "Error: PostgreSQL backup failed"
    exit 1
fi

echo "PostgreSQL backup process completed at $(date)"