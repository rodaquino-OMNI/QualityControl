#!/bin/bash

# MongoDB Restore Script for Multiple Backup Types
set -e

# Configuration
BACKUP_DIR="/backups/mongodb"
DUMP_BACKUP_DIR="${BACKUP_DIR}/dump-backups"
OPLOG_BACKUP_DIR="${BACKUP_DIR}/oplog-backups"
EXPORT_BACKUP_DIR="${BACKUP_DIR}/export-backups"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to list available backups
list_backups() {
    echo "Available MongoDB backups:"
    echo "=========================="
    
    echo ""
    echo "Dump Backups (mongorestore):"
    echo "----------------------------"
    if [ -d "$DUMP_BACKUP_DIR" ]; then
        for backup in $(ls -1 "$DUMP_BACKUP_DIR"/*.tar.gz 2>/dev/null | sort -r | head -10); do
            local basename=$(basename "$backup")
            local metadata_file="${backup}.metadata.json"
            if [ -f "$metadata_file" ]; then
                local created_at=$(jq -r '.created_at' "$metadata_file" 2>/dev/null || echo "unknown")
                local file_size=$(jq -r '.file_size_human' "$metadata_file" 2>/dev/null || echo "unknown")
                local database=$(jq -r '.mongodb_database' "$metadata_file" 2>/dev/null || echo "unknown")
                echo "  - $basename (Created: $created_at, Size: $file_size, DB: $database)"
            else
                echo "  - $basename (Metadata missing)"
            fi
        done
    else
        print_status $YELLOW "No dump backups found"
    fi
    
    echo ""
    echo "Oplog Backups:"
    echo "--------------"
    if [ -d "$OPLOG_BACKUP_DIR" ]; then
        for backup in $(ls -1 "$OPLOG_BACKUP_DIR"/*.bson.gz 2>/dev/null | sort -r | head -10); do
            local basename=$(basename "$backup")
            local metadata_file="${backup}.metadata.json"
            if [ -f "$metadata_file" ]; then
                local created_at=$(jq -r '.created_at' "$metadata_file" 2>/dev/null || echo "unknown")
                local file_size=$(jq -r '.file_size_human' "$metadata_file" 2>/dev/null || echo "unknown")
                echo "  - $basename (Created: $created_at, Size: $file_size)"
            else
                echo "  - $basename (Metadata missing)"
            fi
        done
    else
        print_status $YELLOW "No oplog backups found"
    fi
    
    echo ""
    echo "Export Backups (JSON):"
    echo "---------------------"
    if [ -d "$EXPORT_BACKUP_DIR" ]; then
        for backup in $(ls -1 "$EXPORT_BACKUP_DIR"/*.tar.gz 2>/dev/null | sort -r | head -10); do
            local basename=$(basename "$backup")
            local metadata_file="${backup}.metadata.json"
            if [ -f "$metadata_file" ]; then
                local created_at=$(jq -r '.created_at' "$metadata_file" 2>/dev/null || echo "unknown")
                local file_size=$(jq -r '.file_size_human' "$metadata_file" 2>/dev/null || echo "unknown")
                local database=$(jq -r '.mongodb_database' "$metadata_file" 2>/dev/null || echo "unknown")
                echo "  - $basename (Created: $created_at, Size: $file_size, DB: $database)"
            else
                echo "  - $basename (Metadata missing)"
            fi
        done
    else
        print_status $YELLOW "No export backups found"
    fi
}

# Function to download backup from S3 if needed
download_backup_from_s3() {
    local backup_type=$1
    local backup_name=$2
    local local_backup_dir
    
    case "$backup_type" in
        "dump")
            local_backup_dir="$DUMP_BACKUP_DIR"
            ;;
        "export")
            local_backup_dir="$EXPORT_BACKUP_DIR"
            ;;
        "oplog")
            local_backup_dir="$OPLOG_BACKUP_DIR"
            ;;
        *)
            print_status $RED "Invalid backup type: $backup_type"
            return 1
            ;;
    esac
    
    local local_backup_path="$local_backup_dir/$backup_name"
    
    if [ ! -f "$local_backup_path" ] && [ ! -z "$S3_BUCKET" ]; then
        print_status $YELLOW "Backup not found locally. Downloading from S3..."
        
        aws s3 cp "s3://${S3_BUCKET}/mongodb/${backup_type}/${backup_name}" "$local_backup_path"
        
        if [ $? -ne 0 ]; then
            print_status $RED "Failed to download backup from S3"
            return 1
        fi
        
        # Also download metadata if available
        aws s3 cp "s3://${S3_BUCKET}/mongodb/${backup_type}/${backup_name}.metadata.json" "${local_backup_path}.metadata.json" 2>/dev/null || true
        
        print_status $GREEN "Backup downloaded successfully from S3"
    fi
    
    return 0
}

# Function to validate backup file
validate_backup() {
    local backup_path=$1
    local backup_type=$2
    
    print_status $YELLOW "Validating backup file..."
    
    if [ ! -f "$backup_path" ]; then
        print_status $RED "Backup file not found: $backup_path"
        return 1
    fi
    
    # Check if file can be decompressed
    if ! gzip -t "$backup_path" 2>/dev/null && ! tar -tzf "$backup_path" >/dev/null 2>&1; then
        print_status $RED "Backup file is corrupted or not a valid compressed file"
        return 1
    fi
    
    print_status $GREEN "Backup validation successful"
    return 0
}

# Function to test MongoDB connection
test_mongodb_connection() {
    print_status $YELLOW "Testing MongoDB connection..."
    
    # Parse connection details
    local mongo_host=${MONGO_HOST:-"mongodb"}
    local mongo_port=${MONGO_PORT:-27017}
    local mongo_user=${MONGO_USER:-""}
    local mongo_pass=${MONGO_PASS:-""}
    
    local connect_cmd="mongosh --host ${mongo_host}:${mongo_port}"
    
    if [ ! -z "$mongo_user" ]; then
        connect_cmd="${connect_cmd} --username ${mongo_user} --password ${mongo_pass} --authenticationDatabase admin"
    fi
    
    # Test connection
    echo "db.runCommand('ping')" | eval $connect_cmd --quiet
    
    if [ $? -ne 0 ]; then
        print_status $RED "Cannot connect to MongoDB server"
        return 1
    fi
    
    print_status $GREEN "MongoDB connection successful"
    return 0
}

# Function to restore from mongodump backup
restore_dump() {
    local backup_name=$1
    local target_db=$2
    local backup_path="$DUMP_BACKUP_DIR/$backup_name"
    
    print_status $YELLOW "Restoring from dump backup: $backup_name"
    
    # Validate backup
    validate_backup "$backup_path" "dump"
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    # Test MongoDB connection
    test_mongodb_connection
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    # Extract backup
    local temp_dir="/tmp/mongodb_restore_$(date +%s)"
    mkdir -p "$temp_dir"
    
    cd "$temp_dir"
    tar -xzf "$backup_path"
    
    if [ $? -ne 0 ]; then
        print_status $RED "Failed to extract backup"
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Find extracted directory
    local extracted_dir=$(find "$temp_dir" -type d -name "mongodb_dump_*" | head -1)
    if [ -z "$extracted_dir" ]; then
        print_status $RED "Cannot find extracted dump directory"
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Build mongorestore command
    local mongo_host=${MONGO_HOST:-"mongodb"}
    local mongo_port=${MONGO_PORT:-27017}
    local mongo_user=${MONGO_USER:-""}
    local mongo_pass=${MONGO_PASS:-""}
    
    local restore_cmd="mongorestore --host ${mongo_host}:${mongo_port}"
    
    # Add authentication if provided
    if [ ! -z "$mongo_user" ]; then
        restore_cmd="${restore_cmd} --username ${mongo_user} --password ${mongo_pass} --authenticationDatabase admin"
    fi
    
    # Add target database if specified
    if [ ! -z "$target_db" ]; then
        restore_cmd="${restore_cmd} --db ${target_db}"
    fi
    
    # Add drop option for clean restore
    restore_cmd="${restore_cmd} --drop"
    
    # Point to extracted directory
    restore_cmd="${restore_cmd} ${extracted_dir}"
    
    print_status $YELLOW "Executing restore command..."
    print_status $YELLOW "Command: $restore_cmd"
    
    # Execute restore
    eval $restore_cmd
    
    local restore_status=$?
    
    # Clean up temporary directory
    rm -rf "$temp_dir"
    
    if [ $restore_status -eq 0 ]; then
        print_status $GREEN "Dump restore completed successfully"
        return 0
    else
        print_status $RED "Dump restore failed"
        return 1
    fi
}

# Function to restore from JSON export
restore_export() {
    local backup_name=$1
    local target_db=$2
    local backup_path="$EXPORT_BACKUP_DIR/$backup_name"
    
    print_status $YELLOW "Restoring from JSON export: $backup_name"
    
    # Validate backup
    validate_backup "$backup_path" "export"
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    # Test MongoDB connection
    test_mongodb_connection
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    # Extract backup
    local temp_dir="/tmp/mongodb_export_restore_$(date +%s)"
    mkdir -p "$temp_dir"
    
    cd "$temp_dir"
    tar -xzf "$backup_path"
    
    if [ $? -ne 0 ]; then
        print_status $RED "Failed to extract export backup"
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Find extracted directory
    local extracted_dir=$(find "$temp_dir" -type d -name "mongodb_export_*" | head -1)
    if [ -z "$extracted_dir" ]; then
        print_status $RED "Cannot find extracted export directory"
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Connection parameters
    local mongo_host=${MONGO_HOST:-"mongodb"}
    local mongo_port=${MONGO_PORT:-27017}
    local mongo_user=${MONGO_USER:-""}
    local mongo_pass=${MONGO_PASS:-""}
    
    # Restore each database/collection
    print_status $YELLOW "Restoring collections from JSON export..."
    
    for db_dir in "$extracted_dir"/*; do
        if [ -d "$db_dir" ]; then
            local db_name=$(basename "$db_dir")
            
            # Use target database if specified
            if [ ! -z "$target_db" ]; then
                db_name="$target_db"
            fi
            
            print_status $YELLOW "Restoring database: $db_name"
            
            for collection_file in "$db_dir"/*.json; do
                if [ -f "$collection_file" ]; then
                    local collection_name=$(basename "$collection_file" .json)
                    
                    print_status $YELLOW "  Restoring collection: $collection_name"
                    
                    # Build mongoimport command
                    local import_cmd="mongoimport --host ${mongo_host}:${mongo_port} --db ${db_name} --collection ${collection_name} --file ${collection_file} --drop"
                    
                    # Add authentication if provided
                    if [ ! -z "$mongo_user" ]; then
                        import_cmd="${import_cmd} --username ${mongo_user} --password ${mongo_pass} --authenticationDatabase admin"
                    fi
                    
                    # Execute import
                    eval $import_cmd
                    
                    if [ $? -ne 0 ]; then
                        print_status $RED "Failed to restore collection: $collection_name"
                        rm -rf "$temp_dir"
                        return 1
                    fi
                fi
            done
        fi
    done
    
    # Clean up temporary directory
    rm -rf "$temp_dir"
    
    print_status $GREEN "JSON export restore completed successfully"
    return 0
}

# Function to verify restore
verify_restore() {
    local target_db=$1
    
    print_status $YELLOW "Verifying MongoDB restore..."
    
    # Test connection
    if ! test_mongodb_connection; then
        return 1
    fi
    
    # Connection parameters
    local mongo_host=${MONGO_HOST:-"mongodb"}
    local mongo_port=${MONGO_PORT:-27017}
    local mongo_user=${MONGO_USER:-""}
    local mongo_pass=${MONGO_PASS:-""}
    
    local connect_cmd="mongosh --host ${mongo_host}:${mongo_port}"
    
    if [ ! -z "$mongo_user" ]; then
        connect_cmd="${connect_cmd} --username ${mongo_user} --password ${mongo_pass} --authenticationDatabase admin"
    fi
    
    # Get database statistics
    if [ ! -z "$target_db" ]; then
        # Check specific database
        local db_stats=$(echo "use ${target_db}; db.stats()" | eval $connect_cmd --quiet 2>/dev/null)
        local collection_count=$(echo "use ${target_db}; db.getCollectionNames().length" | eval $connect_cmd --quiet 2>/dev/null)
        
        print_status $GREEN "Restore verification successful for database: $target_db"
        echo "  - Collections: $collection_count"
    else
        # Check all databases
        local db_list=$(echo "db.adminCommand('listDatabases').databases.forEach(function(db) { print(db.name + ': ' + db.sizeOnDisk); })" | eval $connect_cmd --quiet 2>/dev/null)
        
        print_status $GREEN "Restore verification successful"
        echo "Database information:"
        echo "$db_list"
    fi
    
    return 0
}

# Function to create restore report
create_restore_report() {
    local backup_type=$1
    local backup_name=$2
    local target_db=$3
    local status=$4
    local report_file="/backups/mongodb/restore_report_$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$report_file" << EOF
MongoDB Restore Report
=====================

Restore Details:
- Backup Type: $backup_type
- Backup File: $backup_name
- Target Database: ${target_db:-"all"}
- Restore Time: $(date)
- Status: $status

Post-Restore Information:
$(verify_restore "$target_db" 2>/dev/null || echo "Verification failed")

Next Steps:
1. Verify application connectivity
2. Test critical functionality
3. Check data integrity
4. Monitor MongoDB performance
5. Update monitoring and alerting if needed

Important Notes:
- Always test restore in non-production environment first
- Verify all application functionality after restore
- Consider taking a new backup after successful restore
- Update documentation with restore process lessons learned

EOF
    
    print_status $GREEN "Restore report created: $report_file"
}

# Main function
main() {
    local command=$1
    
    case "$command" in
        "list")
            list_backups
            ;;
        "restore")
            local backup_type=$2
            local backup_name=$3
            local target_db=$4
            
            if [ -z "$backup_type" ] || [ -z "$backup_name" ]; then
                print_status $RED "Usage: $0 restore <dump|export> <backup_name> [target_database]"
                print_status $YELLOW "Use '$0 list' to see available backups"
                exit 1
            fi
            
            # Download from S3 if needed
            download_backup_from_s3 "$backup_type" "$backup_name"
            
            # Perform restore based on type
            case "$backup_type" in
                "dump")
                    restore_dump "$backup_name" "$target_db"
                    local restore_status=$?
                    ;;
                "export")
                    restore_export "$backup_name" "$target_db"
                    local restore_status=$?
                    ;;
                *)
                    print_status $RED "Invalid backup type: $backup_type"
                    print_status $YELLOW "Valid types: dump, export"
                    exit 1
                    ;;
            esac
            
            # Create restore report
            if [ $restore_status -eq 0 ]; then
                create_restore_report "$backup_type" "$backup_name" "$target_db" "SUCCESS"
                verify_restore "$target_db"
            else
                create_restore_report "$backup_type" "$backup_name" "$target_db" "FAILED"
            fi
            
            exit $restore_status
            ;;
        "verify")
            local target_db=$2
            verify_restore "$target_db"
            ;;
        *)
            echo "MongoDB Restore Tool"
            echo "==================="
            echo ""
            echo "Usage: $0 <command> [options]"
            echo ""
            echo "Commands:"
            echo "  list                              - List available backups"
            echo "  restore <type> <backup> [db]     - Restore from specific backup"
            echo "  verify [database]                 - Verify MongoDB status"
            echo ""
            echo "Backup Types:"
            echo "  dump                              - MongoDB dump (mongorestore)"
            echo "  export                            - JSON export (mongoimport)"
            echo ""
            echo "Examples:"
            echo "  $0 list"
            echo "  $0 restore dump mongodb_dump_20240118_020000.tar.gz"
            echo "  $0 restore export mongodb_export_20240118_020000.tar.gz mydb"
            echo "  $0 verify mydb"
            echo ""
            echo "Environment Variables:"
            echo "  MONGO_HOST     - MongoDB host (default: mongodb)"
            echo "  MONGO_PORT     - MongoDB port (default: 27017)"
            echo "  MONGO_USER     - MongoDB username"
            echo "  MONGO_PASS     - MongoDB password"
            echo "  S3_BUCKET      - S3 bucket for remote backups"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"