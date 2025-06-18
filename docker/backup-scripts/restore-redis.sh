#!/bin/bash

# Redis Restore Script for Multiple Backup Types
set -e

# Configuration
BACKUP_DIR="/backups/redis"
RDB_BACKUP_DIR="${BACKUP_DIR}/rdb-backups"
AOF_BACKUP_DIR="${BACKUP_DIR}/aof-backups"
MEMORY_BACKUP_DIR="${BACKUP_DIR}/memory-dumps"

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
    echo "Available Redis backups:"
    echo "========================"
    
    echo ""
    echo "RDB Backups:"
    echo "------------"
    if [ -d "$RDB_BACKUP_DIR" ]; then
        for backup in $(ls -1 "$RDB_BACKUP_DIR"/*.gz 2>/dev/null | sort -r | head -10); do
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
        print_status $YELLOW "No RDB backups found"
    fi
    
    echo ""
    echo "AOF Backups:"
    echo "------------"
    if [ -d "$AOF_BACKUP_DIR" ]; then
        for backup in $(ls -1 "$AOF_BACKUP_DIR"/*.gz 2>/dev/null | sort -r | head -10); do
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
        print_status $YELLOW "No AOF backups found"
    fi
    
    echo ""
    echo "Memory Dumps:"
    echo "-------------"
    if [ -d "$MEMORY_BACKUP_DIR" ]; then
        for backup in $(ls -1 "$MEMORY_BACKUP_DIR"/*.gz 2>/dev/null | sort -r | head -10); do
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
        print_status $YELLOW "No memory dumps found"
    fi
}

# Function to download backup from S3 if needed
download_backup_from_s3() {
    local backup_type=$1
    local backup_name=$2
    local local_backup_dir
    
    case "$backup_type" in
        "rdb")
            local_backup_dir="$RDB_BACKUP_DIR"
            ;;
        "aof")
            local_backup_dir="$AOF_BACKUP_DIR"
            ;;
        "memory")
            local_backup_dir="$MEMORY_BACKUP_DIR"
            ;;
        *)
            print_status $RED "Invalid backup type: $backup_type"
            return 1
            ;;
    esac
    
    local local_backup_path="$local_backup_dir/$backup_name"
    
    if [ ! -f "$local_backup_path" ] && [ ! -z "$S3_BUCKET" ]; then
        print_status $YELLOW "Backup not found locally. Downloading from S3..."
        
        aws s3 cp "s3://${S3_BUCKET}/redis/${backup_type}/${backup_name}" "$local_backup_path"
        
        if [ $? -ne 0 ]; then
            print_status $RED "Failed to download backup from S3"
            return 1
        fi
        
        # Also download metadata if available
        aws s3 cp "s3://${S3_BUCKET}/redis/${backup_type}/${backup_name}.metadata.json" "${local_backup_path}.metadata.json" 2>/dev/null || true
        
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
    if ! gzip -t "$backup_path" 2>/dev/null; then
        print_status $RED "Backup file is corrupted or not a valid gzip file"
        return 1
    fi
    
    # Validate based on backup type
    case "$backup_type" in
        "rdb")
            # For RDB, check if it starts with REDIS magic string
            local magic=$(zcat "$backup_path" | head -c 5)
            if [ "$magic" != "REDIS" ]; then
                print_status $RED "Invalid RDB file format"
                return 1
            fi
            ;;
        "aof")
            # For AOF, check if it contains Redis commands
            if ! zcat "$backup_path" | head -20 | grep -q "^\*"; then
                print_status $RED "Invalid AOF file format"
                return 1
            fi
            ;;
        "memory")
            # For memory dump, check if it's valid JSON
            if ! zcat "$backup_path" | jq . >/dev/null 2>&1; then
                print_status $RED "Invalid memory dump JSON format"
                return 1
            fi
            ;;
    esac
    
    print_status $GREEN "Backup validation successful"
    return 0
}

# Function to restore RDB backup
restore_rdb() {
    local backup_name=$1
    local backup_path="$RDB_BACKUP_DIR/$backup_name"
    
    print_status $YELLOW "Restoring from RDB backup: $backup_name"
    
    # Validate backup
    validate_backup "$backup_path" "rdb"
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    # Stop Redis to replace dump.rdb
    print_status $YELLOW "Stopping Redis service..."
    docker stop austa-redis 2>/dev/null || true
    
    # Extract and replace dump.rdb
    local temp_rdb="/tmp/restore_dump.rdb"
    zcat "$backup_path" > "$temp_rdb"
    
    # Copy to Redis data directory
    docker cp "$temp_rdb" austa-redis:/data/dump.rdb
    
    # Clean up temp file
    rm -f "$temp_rdb"
    
    # Start Redis
    print_status $YELLOW "Starting Redis service..."
    docker start austa-redis
    
    # Wait for Redis to start
    sleep 5
    
    # Verify restore
    if verify_redis_restore; then
        print_status $GREEN "RDB restore completed successfully"
        return 0
    else
        print_status $RED "RDB restore verification failed"
        return 1
    fi
}

# Function to restore AOF backup
restore_aof() {
    local backup_name=$1
    local backup_path="$AOF_BACKUP_DIR/$backup_name"
    
    print_status $YELLOW "Restoring from AOF backup: $backup_name"
    
    # Validate backup
    validate_backup "$backup_path" "aof"
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    # Stop Redis
    print_status $YELLOW "Stopping Redis service..."
    docker stop austa-redis 2>/dev/null || true
    
    # Extract and replace appendonly.aof
    local temp_aof="/tmp/restore_appendonly.aof"
    zcat "$backup_path" > "$temp_aof"
    
    # Copy to Redis data directory
    docker cp "$temp_aof" austa-redis:/data/appendonly.aof
    
    # Clean up temp file
    rm -f "$temp_aof"
    
    # Ensure Redis is configured for AOF
    print_status $YELLOW "Configuring Redis for AOF..."
    
    # Start Redis
    docker start austa-redis
    sleep 5
    
    # Enable AOF if not already enabled
    redis-cli -h redis -p 6379 CONFIG SET appendonly yes
    
    # Verify restore
    if verify_redis_restore; then
        print_status $GREEN "AOF restore completed successfully"
        return 0
    else
        print_status $RED "AOF restore verification failed"
        return 1
    fi
}

# Function to restore from memory dump
restore_memory_dump() {
    local backup_name=$1
    local backup_path="$MEMORY_BACKUP_DIR/$backup_name"
    
    print_status $YELLOW "Restoring from memory dump: $backup_name"
    
    # Validate backup
    validate_backup "$backup_path" "memory"
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    # Extract JSON data
    local temp_json="/tmp/restore_memory.json"
    zcat "$backup_path" > "$temp_json"
    
    # Ensure Redis is running
    docker start austa-redis 2>/dev/null || true
    sleep 5
    
    # Clear existing data (with confirmation)
    print_status $YELLOW "WARNING: This will clear all existing Redis data!"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status $YELLOW "Restore cancelled"
        rm -f "$temp_json"
        return 1
    fi
    
    # Flush all data
    redis-cli -h redis -p 6379 FLUSHALL
    
    # Restore data from JSON
    print_status $YELLOW "Restoring data from memory dump..."
    
    # Parse JSON and restore keys
    jq -r '.data | to_entries[] | "\(.key) \(.value.type) \(.value.value)"' "$temp_json" | while read -r key type value; do
        case "$type" in
            "string")
                redis-cli -h redis -p 6379 SET "$key" "$value" >/dev/null
                ;;
            *)
                # For complex types, we stored placeholder values
                print_status $YELLOW "Skipping complex type: $key ($type)"
                ;;
        esac
    done
    
    # Clean up temp file
    rm -f "$temp_json"
    
    # Verify restore
    if verify_redis_restore; then
        print_status $GREEN "Memory dump restore completed successfully"
        return 0
    else
        print_status $RED "Memory dump restore verification failed"
        return 1
    fi
}

# Function to verify Redis restore
verify_redis_restore() {
    print_status $YELLOW "Verifying Redis restore..."
    
    # Test connection
    if ! redis-cli -h redis -p 6379 ping >/dev/null 2>&1; then
        print_status $RED "Cannot connect to Redis after restore"
        return 1
    fi
    
    # Get basic info
    local key_count=$(redis-cli -h redis -p 6379 DBSIZE)
    local memory_usage=$(redis-cli -h redis -p 6379 INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    
    print_status $GREEN "Redis restore verification successful"
    echo "  - Keys restored: $key_count"
    echo "  - Memory usage: $memory_usage"
    
    return 0
}

# Function to create restore report
create_restore_report() {
    local backup_type=$1
    local backup_name=$2
    local status=$3
    local report_file="/backups/redis/restore_report_$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$report_file" << EOF
Redis Restore Report
===================

Restore Details:
- Backup Type: $backup_type
- Backup File: $backup_name
- Restore Time: $(date)
- Status: $status

Post-Restore Information:
- Keys Count: $(redis-cli -h redis -p 6379 DBSIZE 2>/dev/null || echo "N/A")
- Memory Usage: $(redis-cli -h redis -p 6379 INFO memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r' || echo "N/A")
- Redis Version: $(redis-cli -h redis -p 6379 INFO server 2>/dev/null | grep redis_version | cut -d: -f2 | tr -d '\r' || echo "N/A")

Next Steps:
1. Verify application connectivity
2. Test critical functionality
3. Monitor Redis performance
4. Update monitoring and alerting if needed

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
            
            if [ -z "$backup_type" ] || [ -z "$backup_name" ]; then
                print_status $RED "Usage: $0 restore <rdb|aof|memory> <backup_name>"
                print_status $YELLOW "Use '$0 list' to see available backups"
                exit 1
            fi
            
            # Download from S3 if needed
            download_backup_from_s3 "$backup_type" "$backup_name"
            
            # Perform restore based on type
            case "$backup_type" in
                "rdb")
                    restore_rdb "$backup_name"
                    local restore_status=$?
                    ;;
                "aof")
                    restore_aof "$backup_name"
                    local restore_status=$?
                    ;;
                "memory")
                    restore_memory_dump "$backup_name"
                    local restore_status=$?
                    ;;
                *)
                    print_status $RED "Invalid backup type: $backup_type"
                    print_status $YELLOW "Valid types: rdb, aof, memory"
                    exit 1
                    ;;
            esac
            
            # Create restore report
            if [ $restore_status -eq 0 ]; then
                create_restore_report "$backup_type" "$backup_name" "SUCCESS"
            else
                create_restore_report "$backup_type" "$backup_name" "FAILED"
            fi
            
            exit $restore_status
            ;;
        "verify")
            verify_redis_restore
            ;;
        *)
            echo "Redis Restore Tool"
            echo "=================="
            echo ""
            echo "Usage: $0 <command> [options]"
            echo ""
            echo "Commands:"
            echo "  list                        - List available backups"
            echo "  restore <type> <backup>     - Restore from specific backup"
            echo "  verify                      - Verify Redis status"
            echo ""
            echo "Backup Types:"
            echo "  rdb                         - Redis Database snapshot"
            echo "  aof                         - Append Only File"
            echo "  memory                      - Memory dump (JSON format)"
            echo ""
            echo "Examples:"
            echo "  $0 list"
            echo "  $0 restore rdb redis_rdb_20240118_020000.gz"
            echo "  $0 restore aof redis_aof_20240118_020000.gz"
            echo "  $0 verify"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"