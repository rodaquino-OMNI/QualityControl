#!/bin/bash

# Enhanced MongoDB Backup Script with Multiple Strategies
set -e

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/mongodb"
DUMP_BACKUP_DIR="${BACKUP_DIR}/dump-backups"
OPLOG_BACKUP_DIR="${BACKUP_DIR}/oplog-backups"
EXPORT_BACKUP_DIR="${BACKUP_DIR}/export-backups"
RETENTION_DAYS=${RETENTION_DAYS:-30}

# Create backup directories
mkdir -p "${DUMP_BACKUP_DIR}" "${OPLOG_BACKUP_DIR}" "${EXPORT_BACKUP_DIR}"

echo "Starting MongoDB backup at $(date)"

# Parse MONGODB_URL
MONGO_HOST=${MONGO_HOST:-"mongodb"}
MONGO_PORT=${MONGO_PORT:-27017}
MONGO_USER=${MONGO_USER:-""}
MONGO_PASS=${MONGO_PASS:-""}
MONGO_DB=${MONGO_DB:-""}

# Parse from MONGODB_URL if provided
if [ ! -z "$MONGODB_URL" ]; then
    if [[ $MONGODB_URL =~ mongodb://([^:]+):([^@]+)@([^:]+):([^/]+)/(.+) ]]; then
        MONGO_USER="${BASH_REMATCH[1]}"
        MONGO_PASS="${BASH_REMATCH[2]}"
        MONGO_HOST="${BASH_REMATCH[3]}"
        MONGO_PORT="${BASH_REMATCH[4]}"
        MONGO_DB="${BASH_REMATCH[5]}"
    elif [[ $MONGODB_URL =~ mongodb://([^:]+):([^/]+)/(.+) ]]; then
        MONGO_HOST="${BASH_REMATCH[1]}"
        MONGO_PORT="${BASH_REMATCH[2]}"
        MONGO_DB="${BASH_REMATCH[3]}"
        MONGO_USER=""
        MONGO_PASS=""
    else
        echo "Error: Invalid MONGODB_URL format"
        exit 1
    fi
fi

# Function to test MongoDB connection
test_mongodb_connection() {
    echo "Testing MongoDB connection..."
    
    local connect_cmd="mongosh --host ${MONGO_HOST}:${MONGO_PORT}"
    
    if [ ! -z "$MONGO_USER" ]; then
        connect_cmd="${connect_cmd} --username ${MONGO_USER} --password ${MONGO_PASS} --authenticationDatabase admin"
    fi
    
    # Test connection
    echo "db.runCommand('ping')" | eval $connect_cmd --quiet
    
    if [ $? -ne 0 ]; then
        echo "Error: Cannot connect to MongoDB server"
        exit 1
    fi
    
    echo "MongoDB connection successful"
}

# Function to get MongoDB server info
get_mongodb_info() {
    local connect_cmd="mongosh --host ${MONGO_HOST}:${MONGO_PORT}"
    
    if [ ! -z "$MONGO_USER" ]; then
        connect_cmd="${connect_cmd} --username ${MONGO_USER} --password ${MONGO_PASS} --authenticationDatabase admin"
    fi
    
    echo "db.version()" | eval $connect_cmd --quiet
}

# Function to perform mongodump backup
backup_mongodump() {
    echo "Creating mongodump backup..."
    
    local dump_name="mongodb_dump_${TIMESTAMP}"
    local dump_path="${DUMP_BACKUP_DIR}/${dump_name}"
    local archive_name="${dump_name}.tar.gz"
    
    # Create temporary dump directory
    mkdir -p "${dump_path}"
    
    # Build mongodump command
    local mongodump_cmd="mongodump --host ${MONGO_HOST}:${MONGO_PORT} --out ${dump_path}"
    
    # Add authentication if provided
    if [ ! -z "$MONGO_USER" ]; then
        mongodump_cmd="${mongodump_cmd} --username ${MONGO_USER} --password ${MONGO_PASS} --authenticationDatabase admin"
    fi
    
    # Add specific database if provided
    if [ ! -z "$MONGO_DB" ]; then
        mongodump_cmd="${mongodump_cmd} --db ${MONGO_DB}"
    fi
    
    # Add oplog for replica set backups
    mongodump_cmd="${mongodump_cmd} --oplog"
    
    # Perform backup
    eval $mongodump_cmd
    
    if [ $? -eq 0 ]; then
        echo "MongoDB dump completed successfully"
        
        # Create compressed archive
        cd "${DUMP_BACKUP_DIR}"
        tar -czf "${archive_name}" "${dump_name}/"
        rm -rf "${dump_name}/"
        
        echo "MongoDB dump compressed: ${archive_name}"
        
        # Create metadata
        create_backup_metadata "mongodump" "${archive_name}" "${DUMP_BACKUP_DIR}/${archive_name}"
        
        # Upload to S3 if configured
        if [ ! -z "$S3_BUCKET" ]; then
            aws s3 cp "${DUMP_BACKUP_DIR}/${archive_name}" "s3://${S3_BUCKET}/mongodb/dump/${archive_name}"
        fi
        
        return 0
    else
        echo "Error: MongoDB dump failed"
        return 1
    fi
}

# Function to backup oplog
backup_oplog() {
    echo "Creating oplog backup..."
    
    local oplog_name="mongodb_oplog_${TIMESTAMP}.bson"
    local oplog_path="${OPLOG_BACKUP_DIR}/${oplog_name}"
    
    # Build mongoexport command for oplog
    local oplog_cmd="mongoexport --host ${MONGO_HOST}:${MONGO_PORT} --db local --collection oplog.rs --out ${oplog_path}"
    
    # Add authentication if provided
    if [ ! -z "$MONGO_USER" ]; then
        oplog_cmd="${oplog_cmd} --username ${MONGO_USER} --password ${MONGO_PASS} --authenticationDatabase admin"
    fi
    
    # Export oplog
    eval $oplog_cmd
    
    if [ $? -eq 0 ] && [ -f "$oplog_path" ]; then
        echo "Oplog backup completed: ${oplog_name}"
        
        # Compress oplog
        gzip "$oplog_path"
        echo "Oplog backup compressed: ${oplog_name}.gz"
        
        # Create metadata
        create_backup_metadata "oplog" "${oplog_name}.gz" "${OPLOG_BACKUP_DIR}/${oplog_name}.gz"
        
        # Upload to S3
        if [ ! -z "$S3_BUCKET" ]; then
            aws s3 cp "${OPLOG_BACKUP_DIR}/${oplog_name}.gz" "s3://${S3_BUCKET}/mongodb/oplog/${oplog_name}.gz"
        fi
        
        return 0
    else
        echo "Warning: Oplog backup failed or oplog not available"
        return 1
    fi
}

# Function to export collections as JSON
backup_json_export() {
    echo "Creating JSON export backup..."
    
    local export_name="mongodb_export_${TIMESTAMP}"
    local export_path="${EXPORT_BACKUP_DIR}/${export_name}"
    local archive_name="${export_name}.tar.gz"
    
    # Create export directory
    mkdir -p "${export_path}"
    
    # Get list of databases
    local connect_cmd="mongosh --host ${MONGO_HOST}:${MONGO_PORT}"
    if [ ! -z "$MONGO_USER" ]; then
        connect_cmd="${connect_cmd} --username ${MONGO_USER} --password ${MONGO_PASS} --authenticationDatabase admin"
    fi
    
    # Export specific database or all databases
    if [ ! -z "$MONGO_DB" ]; then
        export_database "$MONGO_DB" "$export_path"
    else
        # Get list of databases (excluding system databases)
        local databases=$(echo "db.adminCommand('listDatabases').databases.forEach(function(db) { if (db.name !== 'admin' && db.name !== 'local' && db.name !== 'config') print(db.name); })" | eval $connect_cmd --quiet | grep -v "^$")
        
        for db in $databases; do
            export_database "$db" "$export_path"
        done
    fi
    
    # Create compressed archive
    cd "${EXPORT_BACKUP_DIR}"
    if [ -d "$export_name" ] && [ "$(ls -A $export_name)" ]; then
        tar -czf "${archive_name}" "${export_name}/"
        rm -rf "${export_name}/"
        
        echo "JSON export compressed: ${archive_name}"
        
        # Create metadata
        create_backup_metadata "json_export" "${archive_name}" "${EXPORT_BACKUP_DIR}/${archive_name}"
        
        # Upload to S3
        if [ ! -z "$S3_BUCKET" ]; then
            aws s3 cp "${EXPORT_BACKUP_DIR}/${archive_name}" "s3://${S3_BUCKET}/mongodb/export/${archive_name}"
        fi
        
        return 0
    else
        echo "Warning: No data exported"
        rm -rf "${export_name}/"
        return 1
    fi
}

# Function to export a specific database
export_database() {
    local db_name=$1
    local export_path=$2
    local db_export_path="${export_path}/${db_name}"
    
    echo "Exporting database: ${db_name}"
    mkdir -p "$db_export_path"
    
    # Get collections in database
    local connect_cmd="mongosh --host ${MONGO_HOST}:${MONGO_PORT} ${db_name}"
    if [ ! -z "$MONGO_USER" ]; then
        connect_cmd="${connect_cmd} --username ${MONGO_USER} --password ${MONGO_PASS} --authenticationDatabase admin"
    fi
    
    local collections=$(echo "db.getCollectionNames()" | eval $connect_cmd --quiet | sed 's/\[//g' | sed 's/\]//g' | sed 's/,//g' | sed 's/"//g')
    
    for collection in $collections; do
        if [ ! -z "$collection" ] && [ "$collection" != "null" ]; then
            echo "  Exporting collection: ${collection}"
            
            # Build mongoexport command
            local export_cmd="mongoexport --host ${MONGO_HOST}:${MONGO_PORT} --db ${db_name} --collection ${collection} --out ${db_export_path}/${collection}.json --pretty"
            
            # Add authentication if provided
            if [ ! -z "$MONGO_USER" ]; then
                export_cmd="${export_cmd} --username ${MONGO_USER} --password ${MONGO_PASS} --authenticationDatabase admin"
            fi
            
            # Export collection
            eval $export_cmd
        fi
    done
}

# Function to create backup metadata
create_backup_metadata() {
    local backup_type=$1
    local backup_name=$2
    local backup_path=$3
    local metadata_file="${backup_path}.metadata.json"
    
    # Get MongoDB server info
    local mongo_version=$(get_mongodb_info)
    
    local file_size=$(stat -f%z "$backup_path" 2>/dev/null || stat -c%s "$backup_path" 2>/dev/null || echo "unknown")
    
    cat > "$metadata_file" << EOF
{
    "backup_name": "${backup_name}",
    "backup_type": "${backup_type}",
    "timestamp": "${TIMESTAMP}",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "mongodb_host": "${MONGO_HOST}",
    "mongodb_port": ${MONGO_PORT},
    "mongodb_database": "${MONGO_DB:-all}",
    "backup_path": "${backup_path}",
    "file_size_bytes": ${file_size},
    "file_size_human": "$(du -sh "$backup_path" | cut -f1)",
    "compression": "gzip",
    "mongodb_version": "${mongo_version}"
}
EOF
    
    echo "Metadata created: ${metadata_file}"
}

# Function to clean up old backups
cleanup_old_backups() {
    echo "Cleaning up old MongoDB backups (retention: ${RETENTION_DAYS} days)..."
    
    # Clean dump backups
    find "${DUMP_BACKUP_DIR}" -name "mongodb_dump_*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    find "${DUMP_BACKUP_DIR}" -name "*.metadata.json" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    
    # Clean oplog backups
    find "${OPLOG_BACKUP_DIR}" -name "mongodb_oplog_*.bson.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    find "${OPLOG_BACKUP_DIR}" -name "*.metadata.json" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    
    # Clean export backups
    find "${EXPORT_BACKUP_DIR}" -name "mongodb_export_*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    find "${EXPORT_BACKUP_DIR}" -name "*.metadata.json" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    
    echo "Cleanup completed"
}

# Function to generate backup report
generate_backup_report() {
    local report_file="${BACKUP_DIR}/mongodb_backup_report_${TIMESTAMP}.json"
    
    # Count backups
    local dump_backup_count=$(find "${DUMP_BACKUP_DIR}" -name "mongodb_dump_*.tar.gz" -type f | wc -l)
    local oplog_backup_count=$(find "${OPLOG_BACKUP_DIR}" -name "mongodb_oplog_*.bson.gz" -type f | wc -l)
    local export_backup_count=$(find "${EXPORT_BACKUP_DIR}" -name "mongodb_export_*.tar.gz" -type f | wc -l)
    local total_size=$(du -sh "${BACKUP_DIR}" | cut -f1)
    
    cat > "${report_file}" << EOF
{
    "report_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "backup_type": "mongodb_multi_strategy",
    "mongodb_host": "${MONGO_HOST}",
    "mongodb_port": ${MONGO_PORT},
    "mongodb_database": "${MONGO_DB:-all}",
    "status": "completed",
    "statistics": {
        "dump_backups_count": ${dump_backup_count},
        "oplog_backups_count": ${oplog_backup_count},
        "export_backups_count": ${export_backup_count},
        "total_backup_size": "${total_size}",
        "retention_days": ${RETENTION_DAYS}
    },
    "latest_backups": {
        "dump": "mongodb_dump_${TIMESTAMP}.tar.gz",
        "oplog": "mongodb_oplog_${TIMESTAMP}.bson.gz",
        "export": "mongodb_export_${TIMESTAMP}.tar.gz"
    },
    "next_backup": "$(date -d '+1 day' '+%Y-%m-%d 02:00:00')"
}
EOF
    
    echo "MongoDB backup report generated: ${report_file}"
    
    # Upload report to S3
    if [ ! -z "$S3_BUCKET" ]; then
        aws s3 cp "${report_file}" "s3://${S3_BUCKET}/mongodb/reports/"
    fi
}

# Main execution
main() {
    local backup_type="${1:-all}"
    
    # Test connection first
    test_mongodb_connection
    
    case "$backup_type" in
        "dump")
            backup_mongodump
            ;;
        "oplog")
            backup_oplog
            ;;
        "export")
            backup_json_export
            ;;
        "all")
            backup_mongodump
            backup_oplog
            backup_json_export
            ;;
        *)
            echo "Usage: $0 {dump|oplog|export|all}"
            exit 1
            ;;
    esac
    
    # Always clean up old backups
    cleanup_old_backups
    
    # Generate backup report
    generate_backup_report
}

# Execute main function
main "$@"

echo "MongoDB backup process completed at $(date)"