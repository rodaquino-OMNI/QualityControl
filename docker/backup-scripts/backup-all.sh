#!/bin/bash

# Master backup script that runs all backups
set -e

echo "=== Starting AUSTA Cockpit Full Backup ==="
echo "Timestamp: $(date)"

# Run PostgreSQL backup
echo "--- PostgreSQL Backup ---"
/scripts/backup-postgres.sh
if [ $? -ne 0 ]; then
    echo "PostgreSQL backup failed!"
    exit 1
fi

# Run MongoDB backup
echo "--- MongoDB Backup ---"
/scripts/backup-mongodb.sh
if [ $? -ne 0 ]; then
    echo "MongoDB backup failed!"
    exit 1
fi

# Backup Docker volumes
echo "--- Docker Volumes Backup ---"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
VOLUMES_BACKUP="/backups/volumes/volumes_backup_${TIMESTAMP}.tar.gz"
mkdir -p /backups/volumes

# Create volume backup
docker run --rm \
    -v backend-uploads:/data/backend-uploads:ro \
    -v ai-models:/data/ai-models:ro \
    -v ai-cache:/data/ai-cache:ro \
    -v /backups/volumes:/backup \
    alpine:latest \
    tar -czf "/backup/volumes_backup_${TIMESTAMP}.tar.gz" /data/

if [ $? -eq 0 ]; then
    echo "Docker volumes backup completed: volumes_backup_${TIMESTAMP}.tar.gz"
    
    # Upload to S3 if configured
    if [ ! -z "$S3_BUCKET" ]; then
        aws s3 cp "${VOLUMES_BACKUP}" "s3://${S3_BUCKET}/volumes/volumes_backup_${TIMESTAMP}.tar.gz"
    fi
    
    # Clean up old backups
    find /backups/volumes -name "volumes_backup_*.tar.gz" -mtime +7 -delete
else
    echo "Docker volumes backup failed!"
fi

# Create backup summary
echo "--- Backup Summary ---"
SUMMARY_FILE="/backups/backup_summary_${TIMESTAMP}.txt"
cat > "${SUMMARY_FILE}" << EOF
AUSTA Cockpit Backup Summary
========================
Date: $(date)
PostgreSQL: Success
MongoDB: Success
Docker Volumes: Success

Backup Sizes:
$(du -sh /backups/postgres/postgres_backup_${TIMESTAMP}.sql.gz 2>/dev/null || echo "PostgreSQL: N/A")
$(du -sh /backups/mongodb/mongodb_backup_${TIMESTAMP}.tar.gz 2>/dev/null || echo "MongoDB: N/A")
$(du -sh /backups/volumes/volumes_backup_${TIMESTAMP}.tar.gz 2>/dev/null || echo "Volumes: N/A")

Total Backup Size: $(du -sh /backups 2>/dev/null | cut -f1)
EOF

# Upload summary to S3
if [ ! -z "$S3_BUCKET" ]; then
    aws s3 cp "${SUMMARY_FILE}" "s3://${S3_BUCKET}/summaries/"
fi

echo "=== AUSTA Cockpit Full Backup Completed ==="
echo "Summary saved to: ${SUMMARY_FILE}"

# Clean up old summaries
find /backups -name "backup_summary_*.txt" -mtime +30 -delete

# Send notification if webhook is configured
if [ ! -z "$BACKUP_WEBHOOK_URL" ]; then
    curl -X POST "${BACKUP_WEBHOOK_URL}" \
        -H "Content-Type: application/json" \
        -d "{\"text\": \"AUSTA Cockpit backup completed successfully at $(date)\"}"
fi