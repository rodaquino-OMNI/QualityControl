#!/bin/bash

# PostgreSQL Point-in-Time Recovery (PITR) Restore Script
set -e

# Configuration
RESTORE_DIR="/backups/postgres/restore"
BASE_BACKUP_DIR="/backups/postgres/base-backups"
WAL_BACKUP_DIR="/backups/postgres/wal-archive"

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
    echo "Available PostgreSQL backups:"
    echo "=============================="
    
    if [ -d "$BASE_BACKUP_DIR" ]; then
        for backup in $(ls -1 "$BASE_BACKUP_DIR" | sort -r); do
            if [ -f "$BASE_BACKUP_DIR/$backup/backup_metadata.json" ]; then
                local timestamp=$(jq -r '.timestamp' "$BASE_BACKUP_DIR/$backup/backup_metadata.json" 2>/dev/null || echo "unknown")
                local created_at=$(jq -r '.created_at' "$BASE_BACKUP_DIR/$backup/backup_metadata.json" 2>/dev/null || echo "unknown")
                echo "  - $backup (Created: $created_at)"
            else
                echo "  - $backup (Metadata missing)"
            fi
        done
    else
        print_status $RED "No backups directory found at $BASE_BACKUP_DIR"
        exit 1
    fi
}

# Function to download backup from S3 if needed
download_backup_from_s3() {
    local backup_name=$1
    local local_backup_path="$BASE_BACKUP_DIR/$backup_name"
    
    if [ ! -d "$local_backup_path" ] && [ ! -z "$S3_BUCKET" ]; then
        print_status $YELLOW "Backup not found locally. Downloading from S3..."
        
        aws s3 sync "s3://${S3_BUCKET}/postgres/base-backups/${backup_name}/" "$local_backup_path/"
        
        if [ $? -ne 0 ]; then
            print_status $RED "Failed to download backup from S3"
            exit 1
        fi
        
        print_status $GREEN "Backup downloaded successfully from S3"
    fi
}

# Function to validate target time format
validate_target_time() {
    local target_time=$1
    
    # Check if it's a valid timestamp format (YYYY-MM-DD HH:MM:SS)
    if ! date -d "$target_time" >/dev/null 2>&1; then
        print_status $RED "Invalid target time format. Use: YYYY-MM-DD HH:MM:SS"
        exit 1
    fi
}

# Function to prepare recovery environment
prepare_recovery() {
    local backup_name=$1
    local target_time=$2
    local backup_path="$BASE_BACKUP_DIR/$backup_name"
    
    print_status $YELLOW "Preparing recovery environment..."
    
    # Create restore directory
    mkdir -p "$RESTORE_DIR"
    rm -rf "$RESTORE_DIR"/*
    
    # Extract base backup
    if [ -f "$backup_path/base.tar.gz" ]; then
        print_status $YELLOW "Extracting base backup..."
        cd "$RESTORE_DIR"
        tar -xzf "$backup_path/base.tar.gz"
    else
        print_status $RED "Base backup file not found: $backup_path/base.tar.gz"
        exit 1
    fi
    
    # Extract WAL backup if exists
    if [ -f "$backup_path/pg_wal.tar.gz" ]; then
        print_status $YELLOW "Extracting WAL files..."
        cd "$RESTORE_DIR"
        tar -xzf "$backup_path/pg_wal.tar.gz"
    fi
    
    # Create recovery configuration
    create_recovery_config "$target_time"
    
    print_status $GREEN "Recovery environment prepared"
}

# Function to create recovery configuration
create_recovery_config() {
    local target_time=$1
    
    print_status $YELLOW "Creating recovery configuration..."
    
    # Create postgresql.conf with recovery settings
    cat >> "$RESTORE_DIR/postgresql.conf" << EOF

# Recovery Configuration
restore_command = 'cp ${WAL_BACKUP_DIR}/%f %p'
recovery_target_time = '${target_time}'
recovery_target_action = 'promote'
EOF
    
    # Create standby.signal for PostgreSQL 12+
    touch "$RESTORE_DIR/standby.signal"
    
    print_status $GREEN "Recovery configuration created"
}

# Function to perform recovery
perform_recovery() {
    local backup_name=$1
    local target_time=$2
    local new_data_dir=${3:-"/tmp/postgres_recovery"}
    
    print_status $YELLOW "Starting PostgreSQL recovery..."
    
    # Stop existing PostgreSQL if running
    if pgrep postgres >/dev/null; then
        print_status $YELLOW "Stopping existing PostgreSQL service..."
        # This would depend on your system (systemctl, docker, etc.)
        # For Docker environment:
        docker stop austa-postgres 2>/dev/null || true
    fi
    
    # Create new data directory
    mkdir -p "$new_data_dir"
    rm -rf "$new_data_dir"/*
    
    # Copy restored data
    cp -r "$RESTORE_DIR"/* "$new_data_dir/"
    
    # Set proper permissions
    chmod -R 700 "$new_data_dir"
    
    print_status $GREEN "Recovery preparation completed"
    print_status $YELLOW "To complete recovery, start PostgreSQL with data directory: $new_data_dir"
    
    # Generate recovery instructions
    generate_recovery_instructions "$backup_name" "$target_time" "$new_data_dir"
}

# Function to generate recovery instructions
generate_recovery_instructions() {
    local backup_name=$1
    local target_time=$2
    local data_dir=$3
    local instructions_file="/backups/postgres/recovery_instructions_$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$instructions_file" << EOF
PostgreSQL Point-in-Time Recovery Instructions
==============================================

Backup Used: $backup_name
Target Time: $target_time
Recovery Data Directory: $data_dir
Generated: $(date)

MANUAL STEPS TO COMPLETE RECOVERY:

1. For Docker Environment:
   Update docker-compose.yml to use the new data directory:
   
   volumes:
     - $data_dir:/var/lib/postgresql/data

2. Start PostgreSQL:
   docker-compose up -d postgres

3. Verify Recovery:
   - Check PostgreSQL logs for recovery completion
   - Connect to database and verify data consistency
   - Run: SELECT pg_is_in_recovery(); (should return 'f')

4. Update Application Connections:
   - Test application connectivity
   - Verify data integrity
   - Check all services are working properly

5. Cleanup (After Verification):
   - Remove old data directory if recovery is successful
   - Update backup schedules if needed
   - Document recovery process and lessons learned

ROLLBACK PLAN:
If recovery fails, you can restore the previous state by:
1. Stop PostgreSQL
2. Restore original data directory
3. Restart PostgreSQL
4. Investigate recovery issues

IMPORTANT NOTES:
- Always test recovery in a non-production environment first
- Verify all application functionality after recovery
- Update monitoring and alerting systems if needed
- Consider taking a new full backup after successful recovery

Contact Information:
- Database Administrator: [Your Contact]
- Emergency Contact: [Emergency Contact]
EOF
    
    print_status $GREEN "Recovery instructions saved to: $instructions_file"
    echo "Please follow the instructions in: $instructions_file"
}

# Function to verify recovery status
verify_recovery() {
    local data_dir=$1
    
    print_status $YELLOW "Verifying recovery status..."
    
    # Check if PostgreSQL is running
    if pgrep postgres >/dev/null; then
        # Try to connect and check recovery status
        local recovery_status=$(psql -h localhost -U postgres -d postgres -t -c "SELECT pg_is_in_recovery();" 2>/dev/null || echo "connection_failed")
        
        if [ "$recovery_status" = "connection_failed" ]; then
            print_status $RED "Cannot connect to PostgreSQL"
            return 1
        elif [[ "$recovery_status" == *"f"* ]]; then
            print_status $GREEN "Recovery completed successfully - Database is ready"
            return 0
        else
            print_status $YELLOW "Recovery still in progress..."
            return 2
        fi
    else
        print_status $RED "PostgreSQL is not running"
        return 1
    fi
}

# Main function
main() {
    local command=$1
    
    case "$command" in
        "list")
            list_backups
            ;;
        "restore")
            local backup_name=$2
            local target_time=$3
            local new_data_dir=$4
            
            if [ -z "$backup_name" ]; then
                print_status $RED "Usage: $0 restore <backup_name> [target_time] [data_directory]"
                print_status $YELLOW "Use '$0 list' to see available backups"
                exit 1
            fi
            
            # Set default target time to latest available
            if [ -z "$target_time" ]; then
                target_time=$(date '+%Y-%m-%d %H:%M:%S')
                print_status $YELLOW "No target time specified, using current time: $target_time"
            else
                validate_target_time "$target_time"
            fi
            
            download_backup_from_s3 "$backup_name"
            prepare_recovery "$backup_name" "$target_time"
            perform_recovery "$backup_name" "$target_time" "$new_data_dir"
            ;;
        "verify")
            local data_dir=${2:-"/var/lib/postgresql/data"}
            verify_recovery "$data_dir"
            ;;
        *)
            echo "PostgreSQL Point-in-Time Recovery Tool"
            echo "====================================="
            echo ""
            echo "Usage: $0 <command> [options]"
            echo ""
            echo "Commands:"
            echo "  list                           - List available backups"
            echo "  restore <backup> [time] [dir]  - Restore to specific point in time"
            echo "  verify [data_dir]              - Verify recovery status"
            echo ""
            echo "Examples:"
            echo "  $0 list"
            echo "  $0 restore base_backup_20240118_020000"
            echo "  $0 restore base_backup_20240118_020000 '2024-01-18 14:30:00'"
            echo "  $0 verify /var/lib/postgresql/data"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"