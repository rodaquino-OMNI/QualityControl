#!/bin/bash

# PostgreSQL Backup Script with Point-in-Time Recovery (PITR)
set -e

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres"
BASE_BACKUP_DIR="${BACKUP_DIR}/base-backups"
WAL_BACKUP_DIR="${BACKUP_DIR}/wal-archive"
RETENTION_DAYS=${RETENTION_DAYS:-30}

# Create backup directories
mkdir -p "${BASE_BACKUP_DIR}" "${WAL_BACKUP_DIR}"

echo "Starting PostgreSQL PITR backup at $(date)"

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

# Function to perform base backup
perform_base_backup() {
    local backup_name="base_backup_${TIMESTAMP}"
    local backup_path="${BASE_BACKUP_DIR}/${backup_name}"
    
    echo "Creating base backup: ${backup_name}"
    
    # Create base backup with WAL archiving
    pg_basebackup -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" \
        -D "${backup_path}" \
        -Ft -z -P -v \
        --wal-method=stream \
        --checkpoint=fast \
        --label="${backup_name}"
    
    if [ $? -eq 0 ]; then
        echo "Base backup completed successfully: ${backup_name}"
        
        # Create backup metadata
        cat > "${backup_path}/backup_metadata.json" << EOF
{
    "backup_name": "${backup_name}",
    "timestamp": "${TIMESTAMP}",
    "database": "${DB_NAME}",
    "host": "${DB_HOST}",
    "port": "${DB_PORT}",
    "backup_type": "base_backup",
    "wal_method": "stream",
    "compression": "gzip",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
        
        # Upload to S3 if configured
        if [ ! -z "$S3_BUCKET" ]; then
            echo "Uploading base backup to S3..."
            aws s3 sync "${backup_path}" "s3://${S3_BUCKET}/postgres/base-backups/${backup_name}/" \
                --exclude "*.tmp" --delete
            
            if [ $? -eq 0 ]; then
                echo "Base backup uploaded to S3 successfully"
            else
                echo "Warning: Failed to upload base backup to S3"
            fi
        fi
        
        return 0
    else
        echo "Error: Base backup failed"
        return 1
    fi
}

# Function to archive WAL files
archive_wal_files() {
    echo "Archiving WAL files..."
    
    # Check if WAL archiving is enabled
    local archive_status=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -t -c "SELECT setting FROM pg_settings WHERE name='archive_mode';")
    
    if [[ "${archive_status}" == *"on"* ]]; then
        echo "WAL archiving is enabled"
        
        # Sync WAL files to local archive
        if [ -d "/var/lib/postgresql/data/pg_wal" ]; then
            rsync -av --include="*.ready" --include="*.done" /var/lib/postgresql/data/pg_wal/ "${WAL_BACKUP_DIR}/"
        fi
        
        # Upload WAL files to S3
        if [ ! -z "$S3_BUCKET" ]; then
            aws s3 sync "${WAL_BACKUP_DIR}" "s3://${S3_BUCKET}/postgres/wal-archive/" \
                --exclude "*.tmp" --delete
        fi
    else
        echo "Warning: WAL archiving is not enabled. Consider enabling it for PITR capability."
    fi
}

# Function to clean old backups
cleanup_old_backups() {
    echo "Cleaning up old backups (retention: ${RETENTION_DAYS} days)"
    
    # Remove old base backups
    find "${BASE_BACKUP_DIR}" -name "base_backup_*" -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true
    
    # Remove old WAL files (keep 7 days more than base backups)
    local wal_retention=$((RETENTION_DAYS + 7))
    find "${WAL_BACKUP_DIR}" -name "*.gz" -mtime +${wal_retention} -delete 2>/dev/null || true
    
    # Clean up S3 old backups
    if [ ! -z "$S3_BUCKET" ]; then
        # Note: This requires AWS CLI with lifecycle policies configured
        echo "S3 cleanup managed by lifecycle policies"
    fi
}

# Function to validate backup integrity
validate_backup() {
    local backup_path="$1"
    
    echo "Validating backup integrity..."
    
    # Check if backup files exist
    if [ ! -f "${backup_path}/base.tar.gz" ]; then
        echo "Error: Base backup file not found"
        return 1
    fi
    
    # Verify backup can be extracted
    if ! tar -tzf "${backup_path}/base.tar.gz" >/dev/null 2>&1; then
        echo "Error: Base backup file is corrupted"
        return 1
    fi
    
    echo "Backup validation completed successfully"
    return 0
}

# Main execution
main() {
    # Check if this is a scheduled full backup or incremental
    local backup_type="${1:-full}"
    
    case "$backup_type" in
        "full")
            perform_base_backup
            if [ $? -eq 0 ]; then
                local latest_backup="${BASE_BACKUP_DIR}/base_backup_${TIMESTAMP}"
                validate_backup "$latest_backup"
            fi
            ;;
        "wal")
            archive_wal_files
            ;;
        *)
            echo "Usage: $0 {full|wal}"
            exit 1
            ;;
    esac
    
    # Always clean up old backups
    cleanup_old_backups
    
    # Generate backup report
    generate_backup_report
}

# Function to generate backup report
generate_backup_report() {
    local report_file="${BACKUP_DIR}/postgres_backup_report_${TIMESTAMP}.json"
    
    # Count backups
    local base_backup_count=$(find "${BASE_BACKUP_DIR}" -name "base_backup_*" -type d | wc -l)
    local wal_file_count=$(find "${WAL_BACKUP_DIR}" -name "*.gz" -type f | wc -l)
    local total_size=$(du -sh "${BACKUP_DIR}" | cut -f1)
    
    cat > "${report_file}" << EOF
{
    "report_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "backup_type": "postgresql_pitr",
    "database": "${DB_NAME}",
    "status": "completed",
    "statistics": {
        "base_backups_count": ${base_backup_count},
        "wal_files_count": ${wal_file_count},
        "total_backup_size": "${total_size}",
        "retention_days": ${RETENTION_DAYS}
    },
    "latest_backup": {
        "name": "base_backup_${TIMESTAMP}",
        "timestamp": "${TIMESTAMP}",
        "path": "${BASE_BACKUP_DIR}/base_backup_${TIMESTAMP}"
    },
    "next_backup": "$(date -d '+1 day' '+%Y-%m-%d 02:00:00')"
}
EOF
    
    echo "Backup report generated: ${report_file}"
    
    # Upload report to S3
    if [ ! -z "$S3_BUCKET" ]; then
        aws s3 cp "${report_file}" "s3://${S3_BUCKET}/postgres/reports/"
    fi
}

# Execute main function
main "$@"

echo "PostgreSQL PITR backup process completed at $(date)"