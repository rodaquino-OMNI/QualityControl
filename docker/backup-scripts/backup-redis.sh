#!/bin/bash

# Redis Backup Script with Multiple Persistence Strategies
set -e

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/redis"
RDB_BACKUP_DIR="${BACKUP_DIR}/rdb-backups"
AOF_BACKUP_DIR="${BACKUP_DIR}/aof-backups"
MEMORY_BACKUP_DIR="${BACKUP_DIR}/memory-dumps"
RETENTION_DAYS=${RETENTION_DAYS:-30}

# Create backup directories
mkdir -p "${RDB_BACKUP_DIR}" "${AOF_BACKUP_DIR}" "${MEMORY_BACKUP_DIR}"

echo "Starting Redis backup at $(date)"

# Parse Redis connection details
REDIS_HOST=${REDIS_HOST:-"redis"}
REDIS_PORT=${REDIS_PORT:-6379}
REDIS_PASSWORD=${REDIS_PASSWORD:-""}

# Function to test Redis connection
test_redis_connection() {
    echo "Testing Redis connection..."
    
    if [ ! -z "$REDIS_PASSWORD" ]; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" ping
    else
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping
    fi
    
    if [ $? -ne 0 ]; then
        echo "Error: Cannot connect to Redis server"
        exit 1
    fi
    
    echo "Redis connection successful"
}

# Function to get Redis info
get_redis_info() {
    if [ ! -z "$REDIS_PASSWORD" ]; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" INFO
    else
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO
    fi
}

# Function to backup RDB snapshot
backup_rdb() {
    echo "Creating RDB snapshot backup..."
    
    local rdb_backup_name="redis_rdb_${TIMESTAMP}.rdb"
    local rdb_backup_path="${RDB_BACKUP_DIR}/${rdb_backup_name}"
    
    # Force BGSAVE to create fresh RDB snapshot
    if [ ! -z "$REDIS_PASSWORD" ]; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" BGSAVE
    else
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BGSAVE
    fi
    
    # Wait for background save to complete
    echo "Waiting for background save to complete..."
    while true; do
        local save_status
        if [ ! -z "$REDIS_PASSWORD" ]; then
            save_status=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" LASTSAVE)
        else
            save_status=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LASTSAVE)
        fi
        
        sleep 2
        
        local new_save_status
        if [ ! -z "$REDIS_PASSWORD" ]; then
            new_save_status=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" LASTSAVE)
        else
            new_save_status=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LASTSAVE)
        fi
        
        if [ "$save_status" != "$new_save_status" ]; then
            echo "Background save completed"
            break
        fi
    done
    
    # Copy RDB file from Redis container
    if command -v docker >/dev/null 2>&1; then
        docker cp austa-redis:/data/dump.rdb "$rdb_backup_path"
        
        if [ $? -eq 0 ]; then
            echo "RDB backup created: ${rdb_backup_name}"
            
            # Compress the backup
            gzip "$rdb_backup_path"
            echo "RDB backup compressed: ${rdb_backup_name}.gz"
            
            # Create metadata
            create_backup_metadata "rdb" "${rdb_backup_name}.gz" "${RDB_BACKUP_DIR}/${rdb_backup_name}.gz"
            
            # Upload to S3
            if [ ! -z "$S3_BUCKET" ]; then
                aws s3 cp "${RDB_BACKUP_DIR}/${rdb_backup_name}.gz" "s3://${S3_BUCKET}/redis/rdb/${rdb_backup_name}.gz"
            fi
            
            return 0
        else
            echo "Error: Failed to copy RDB file"
            return 1
        fi
    else
        echo "Warning: Docker not available, cannot copy RDB file"
        return 1
    fi
}

# Function to backup AOF file
backup_aof() {
    echo "Creating AOF backup..."
    
    local aof_backup_name="redis_aof_${TIMESTAMP}.aof"
    local aof_backup_path="${AOF_BACKUP_DIR}/${aof_backup_name}"
    
    # Trigger AOF rewrite for cleaner backup
    if [ ! -z "$REDIS_PASSWORD" ]; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" BGREWRITEAOF
    else
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BGREWRITEAOF
    fi
    
    # Wait for AOF rewrite to complete
    echo "Waiting for AOF rewrite to complete..."
    while true; do
        local aof_status
        if [ ! -z "$REDIS_PASSWORD" ]; then
            aof_status=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" INFO persistence | grep aof_rewrite_in_progress)
        else
            aof_status=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO persistence | grep aof_rewrite_in_progress)
        fi
        
        if [[ "$aof_status" == *"aof_rewrite_in_progress:0"* ]]; then
            echo "AOF rewrite completed"
            break
        fi
        
        sleep 2
    done
    
    # Copy AOF file from Redis container
    if command -v docker >/dev/null 2>&1; then
        docker cp austa-redis:/data/appendonly.aof "$aof_backup_path" 2>/dev/null || {
            echo "Warning: AOF file not found or AOF not enabled"
            return 1
        }
        
        if [ -f "$aof_backup_path" ]; then
            echo "AOF backup created: ${aof_backup_name}"
            
            # Compress the backup
            gzip "$aof_backup_path"
            echo "AOF backup compressed: ${aof_backup_name}.gz"
            
            # Create metadata
            create_backup_metadata "aof" "${aof_backup_name}.gz" "${AOF_BACKUP_DIR}/${aof_backup_name}.gz"
            
            # Upload to S3
            if [ ! -z "$S3_BUCKET" ]; then
                aws s3 cp "${AOF_BACKUP_DIR}/${aof_backup_name}.gz" "s3://${S3_BUCKET}/redis/aof/${aof_backup_name}.gz"
            fi
            
            return 0
        else
            echo "Warning: AOF backup not created"
            return 1
        fi
    else
        echo "Warning: Docker not available, cannot copy AOF file"
        return 1
    fi
}

# Function to create memory dump
backup_memory_dump() {
    echo "Creating Redis memory dump..."
    
    local memory_dump_name="redis_memory_${TIMESTAMP}.json"
    local memory_dump_path="${MEMORY_BACKUP_DIR}/${memory_dump_name}"
    
    # Get all Redis keys and their values
    local total_keys
    if [ ! -z "$REDIS_PASSWORD" ]; then
        total_keys=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" DBSIZE)
    else
        total_keys=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DBSIZE)
    fi
    
    echo "Dumping $total_keys keys from Redis..."
    
    # Create JSON dump of all data
    cat > "$memory_dump_path" << EOF
{
    "backup_info": {
        "timestamp": "${TIMESTAMP}",
        "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "redis_host": "${REDIS_HOST}",
        "redis_port": ${REDIS_PORT},
        "total_keys": ${total_keys},
        "backup_type": "memory_dump"
    },
    "data": {
EOF
    
    # Dump all keys (limited approach for safety)
    local key_count=0
    local max_keys=10000  # Limit to prevent memory issues
    
    if [ ! -z "$REDIS_PASSWORD" ]; then
        keys=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" --scan --count 100 | head -n $max_keys)
    else
        keys=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --scan --count 100 | head -n $max_keys)
    fi
    
    for key in $keys; do
        if [ $key_count -gt 0 ]; then
            echo "," >> "$memory_dump_path"
        fi
        
        # Get key type
        local key_type
        if [ ! -z "$REDIS_PASSWORD" ]; then
            key_type=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" TYPE "$key")
        else
            key_type=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" TYPE "$key")
        fi
        
        # Get key value based on type
        local key_value
        case "$key_type" in
            "string")
                if [ ! -z "$REDIS_PASSWORD" ]; then
                    key_value=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" GET "$key" | sed 's/"/\\"/g')
                else
                    key_value=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "$key" | sed 's/"/\\"/g')
                fi
                ;;
            "hash"|"list"|"set"|"zset")
                key_value="<${key_type}_data>"
                ;;
            *)
                key_value="<unknown_type>"
                ;;
        esac
        
        echo "        \"$key\": {\"type\": \"$key_type\", \"value\": \"$key_value\"}" >> "$memory_dump_path"
        
        key_count=$((key_count + 1))
        
        if [ $((key_count % 1000)) -eq 0 ]; then
            echo "Processed $key_count keys..."
        fi
    done
    
    cat >> "$memory_dump_path" << EOF
    }
}
EOF
    
    echo "Memory dump completed: ${memory_dump_name} ($key_count keys)"
    
    # Compress the dump
    gzip "$memory_dump_path"
    echo "Memory dump compressed: ${memory_dump_name}.gz"
    
    # Create metadata
    create_backup_metadata "memory_dump" "${memory_dump_name}.gz" "${MEMORY_BACKUP_DIR}/${memory_dump_name}.gz"
    
    # Upload to S3
    if [ ! -z "$S3_BUCKET" ]; then
        aws s3 cp "${MEMORY_BACKUP_DIR}/${memory_dump_name}.gz" "s3://${S3_BUCKET}/redis/memory/${memory_dump_name}.gz"
    fi
}

# Function to create backup metadata
create_backup_metadata() {
    local backup_type=$1
    local backup_name=$2
    local backup_path=$3
    local metadata_file="${backup_path}.metadata.json"
    
    # Get Redis server info
    local redis_info
    if [ ! -z "$REDIS_PASSWORD" ]; then
        redis_info=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" INFO server | head -10)
    else
        redis_info=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO server | head -10)
    fi
    
    local file_size=$(stat -f%z "$backup_path" 2>/dev/null || stat -c%s "$backup_path" 2>/dev/null || echo "unknown")
    
    cat > "$metadata_file" << EOF
{
    "backup_name": "${backup_name}",
    "backup_type": "${backup_type}",
    "timestamp": "${TIMESTAMP}",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "redis_host": "${REDIS_HOST}",
    "redis_port": ${REDIS_PORT},
    "backup_path": "${backup_path}",
    "file_size_bytes": ${file_size},
    "file_size_human": "$(du -sh "$backup_path" | cut -f1)",
    "compression": "gzip",
    "redis_version": "$(echo "$redis_info" | grep redis_version | cut -d: -f2 | tr -d '\r')"
}
EOF
    
    echo "Metadata created: ${metadata_file}"
}

# Function to clean up old backups
cleanup_old_backups() {
    echo "Cleaning up old Redis backups (retention: ${RETENTION_DAYS} days)..."
    
    # Clean RDB backups
    find "${RDB_BACKUP_DIR}" -name "redis_rdb_*.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    find "${RDB_BACKUP_DIR}" -name "*.metadata.json" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    
    # Clean AOF backups
    find "${AOF_BACKUP_DIR}" -name "redis_aof_*.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    find "${AOF_BACKUP_DIR}" -name "*.metadata.json" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    
    # Clean memory dumps
    find "${MEMORY_BACKUP_DIR}" -name "redis_memory_*.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    find "${MEMORY_BACKUP_DIR}" -name "*.metadata.json" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    
    echo "Cleanup completed"
}

# Function to generate backup report
generate_backup_report() {
    local report_file="${BACKUP_DIR}/redis_backup_report_${TIMESTAMP}.json"
    
    # Count backups
    local rdb_backup_count=$(find "${RDB_BACKUP_DIR}" -name "redis_rdb_*.gz" -type f | wc -l)
    local aof_backup_count=$(find "${AOF_BACKUP_DIR}" -name "redis_aof_*.gz" -type f | wc -l)
    local memory_backup_count=$(find "${MEMORY_BACKUP_DIR}" -name "redis_memory_*.gz" -type f | wc -l)
    local total_size=$(du -sh "${BACKUP_DIR}" | cut -f1)
    
    cat > "${report_file}" << EOF
{
    "report_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "backup_type": "redis_multi_strategy",
    "redis_host": "${REDIS_HOST}",
    "redis_port": ${REDIS_PORT},
    "status": "completed",
    "statistics": {
        "rdb_backups_count": ${rdb_backup_count},
        "aof_backups_count": ${aof_backup_count},
        "memory_dumps_count": ${memory_backup_count},
        "total_backup_size": "${total_size}",
        "retention_days": ${RETENTION_DAYS}
    },
    "latest_backups": {
        "rdb": "redis_rdb_${TIMESTAMP}.gz",
        "aof": "redis_aof_${TIMESTAMP}.gz",
        "memory_dump": "redis_memory_${TIMESTAMP}.gz"
    },
    "next_backup": "$(date -d '+1 day' '+%Y-%m-%d 02:00:00')"
}
EOF
    
    echo "Redis backup report generated: ${report_file}"
    
    # Upload report to S3
    if [ ! -z "$S3_BUCKET" ]; then
        aws s3 cp "${report_file}" "s3://${S3_BUCKET}/redis/reports/"
    fi
}

# Main execution
main() {
    local backup_type="${1:-all}"
    
    # Test connection first
    test_redis_connection
    
    case "$backup_type" in
        "rdb")
            backup_rdb
            ;;
        "aof")
            backup_aof
            ;;
        "memory")
            backup_memory_dump
            ;;
        "all")
            backup_rdb
            backup_aof
            backup_memory_dump
            ;;
        *)
            echo "Usage: $0 {rdb|aof|memory|all}"
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

echo "Redis backup process completed at $(date)"