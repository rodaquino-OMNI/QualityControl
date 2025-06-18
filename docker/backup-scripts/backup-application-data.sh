#!/bin/bash

# Application Data Export Procedures for AUSTA Cockpit
set -e

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/application-data"
UPLOADS_BACKUP_DIR="${BACKUP_DIR}/uploads"
LOGS_BACKUP_DIR="${BACKUP_DIR}/logs"
CONFIG_BACKUP_DIR="${BACKUP_DIR}/configs"
CACHE_BACKUP_DIR="${BACKUP_DIR}/cache"
REPORTS_BACKUP_DIR="${BACKUP_DIR}/reports"
RETENTION_DAYS=${RETENTION_DAYS:-30}

# Create backup directories
mkdir -p "${UPLOADS_BACKUP_DIR}" "${LOGS_BACKUP_DIR}" "${CONFIG_BACKUP_DIR}" "${CACHE_BACKUP_DIR}" "${REPORTS_BACKUP_DIR}"

echo "Starting application data backup at $(date)"

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

# Function to backup user uploads
backup_uploads() {
    print_status $YELLOW "Backing up user uploads..."
    
    local uploads_archive="uploads_backup_${TIMESTAMP}.tar.gz"
    local uploads_path="${UPLOADS_BACKUP_DIR}/${uploads_archive}"
    
    # Check if uploads volume exists
    if docker volume inspect backend-uploads >/dev/null 2>&1; then
        # Create temporary container to access volume
        docker run --rm \
            -v backend-uploads:/data:ro \
            -v "${UPLOADS_BACKUP_DIR}:/backup" \
            alpine:latest \
            tar -czf "/backup/${uploads_archive}" /data/
        
        if [ $? -eq 0 ] && [ -f "$uploads_path" ]; then
            local file_size=$(du -sh "$uploads_path" | cut -f1)
            print_status $GREEN "Uploads backup completed: ${uploads_archive} (${file_size})"
            
            # Create metadata
            create_backup_metadata "uploads" "$uploads_archive" "$uploads_path"
            
            # Upload to S3
            if [ ! -z "$S3_BUCKET" ]; then
                aws s3 cp "$uploads_path" "s3://${S3_BUCKET}/application-data/uploads/${uploads_archive}"
                aws s3 cp "${uploads_path}.metadata.json" "s3://${S3_BUCKET}/application-data/uploads/${uploads_archive}.metadata.json"
            fi
            
            return 0
        else
            print_status $RED "Failed to create uploads backup"
            return 1
        fi
    else
        print_status $YELLOW "Uploads volume not found, skipping"
        return 0
    fi
}

# Function to backup application logs
backup_logs() {
    print_status $YELLOW "Backing up application logs..."
    
    local logs_archive="logs_backup_${TIMESTAMP}.tar.gz"
    local logs_path="${LOGS_BACKUP_DIR}/${logs_archive}"
    local temp_logs_dir="/tmp/logs_backup_${TIMESTAMP}"
    
    mkdir -p "$temp_logs_dir"
    
    # Collect logs from different sources
    collect_container_logs "$temp_logs_dir"
    collect_volume_logs "$temp_logs_dir"
    collect_system_logs "$temp_logs_dir"
    
    # Create compressed archive
    if [ "$(ls -A $temp_logs_dir)" ]; then
        tar -czf "$logs_path" -C "$temp_logs_dir" .
        
        if [ $? -eq 0 ]; then
            local file_size=$(du -sh "$logs_path" | cut -f1)
            print_status $GREEN "Logs backup completed: ${logs_archive} (${file_size})"
            
            # Create metadata
            create_backup_metadata "logs" "$logs_archive" "$logs_path"
            
            # Upload to S3
            if [ ! -z "$S3_BUCKET" ]; then
                aws s3 cp "$logs_path" "s3://${S3_BUCKET}/application-data/logs/${logs_archive}"
                aws s3 cp "${logs_path}.metadata.json" "s3://${S3_BUCKET}/application-data/logs/${logs_archive}.metadata.json"
            fi
            
            # Clean up temp directory
            rm -rf "$temp_logs_dir"
            return 0
        else
            print_status $RED "Failed to create logs backup"
            rm -rf "$temp_logs_dir"
            return 1
        fi
    else
        print_status $YELLOW "No logs found to backup"
        rm -rf "$temp_logs_dir"
        return 0
    fi
}

# Function to collect container logs
collect_container_logs() {
    local temp_dir=$1
    local container_logs_dir="${temp_dir}/container-logs"
    
    mkdir -p "$container_logs_dir"
    
    print_status $YELLOW "  Collecting container logs..."
    
    # Get list of AUSTA containers
    local containers=$(docker ps -a --format "{{.Names}}" | grep "austa-")
    
    for container in $containers; do
        if [ ! -z "$container" ]; then
            print_status $YELLOW "    Collecting logs from: $container"
            docker logs "$container" > "${container_logs_dir}/${container}_${TIMESTAMP}.log" 2>&1 || true
        fi
    done
}

# Function to collect volume logs
collect_volume_logs() {
    local temp_dir=$1
    local volume_logs_dir="${temp_dir}/volume-logs"
    
    mkdir -p "$volume_logs_dir"
    
    print_status $YELLOW "  Collecting volume logs..."
    
    # Backend logs from volume
    if docker volume inspect backend-logs >/dev/null 2>&1; then
        docker run --rm \
            -v backend-logs:/logs:ro \
            -v "${volume_logs_dir}:/backup" \
            alpine:latest \
            sh -c "find /logs -name '*.log' -exec cp {} /backup/ \;" 2>/dev/null || true
    fi
    
    # AI service logs from volume
    if docker volume inspect ai-service-logs >/dev/null 2>&1; then
        docker run --rm \
            -v ai-service-logs:/logs:ro \
            -v "${volume_logs_dir}:/backup" \
            alpine:latest \
            sh -c "find /logs -name '*.log' -exec cp {} /backup/ \;" 2>/dev/null || true
    fi
}

# Function to collect system logs
collect_system_logs() {
    local temp_dir=$1
    local system_logs_dir="${temp_dir}/system-logs"
    
    mkdir -p "$system_logs_dir"
    
    print_status $YELLOW "  Collecting system logs..."
    
    # Docker daemon logs (if accessible)
    if [ -f "/var/log/docker.log" ]; then
        cp "/var/log/docker.log" "${system_logs_dir}/docker_${TIMESTAMP}.log" 2>/dev/null || true
    fi
    
    # System journal for docker (last 24 hours)
    if command -v journalctl >/dev/null 2>&1; then
        journalctl -u docker --since "24 hours ago" > "${system_logs_dir}/docker_journal_${TIMESTAMP}.log" 2>/dev/null || true
    fi
}

# Function to backup configuration files
backup_configs() {
    print_status $YELLOW "Backing up configuration files..."
    
    local configs_archive="configs_backup_${TIMESTAMP}.tar.gz"
    local configs_path="${CONFIG_BACKUP_DIR}/${configs_archive}"
    local temp_configs_dir="/tmp/configs_backup_${TIMESTAMP}"
    
    mkdir -p "$temp_configs_dir"
    
    # Collect configuration files
    collect_docker_configs "$temp_configs_dir"
    collect_app_configs "$temp_configs_dir"
    collect_nginx_configs "$temp_configs_dir"
    
    # Create compressed archive
    if [ "$(ls -A $temp_configs_dir)" ]; then
        tar -czf "$configs_path" -C "$temp_configs_dir" .
        
        if [ $? -eq 0 ]; then
            local file_size=$(du -sh "$configs_path" | cut -f1)
            print_status $GREEN "Configs backup completed: ${configs_archive} (${file_size})"
            
            # Create metadata
            create_backup_metadata "configs" "$configs_archive" "$configs_path"
            
            # Upload to S3
            if [ ! -z "$S3_BUCKET" ]; then
                aws s3 cp "$configs_path" "s3://${S3_BUCKET}/application-data/configs/${configs_archive}"
                aws s3 cp "${configs_path}.metadata.json" "s3://${S3_BUCKET}/application-data/configs/${configs_archive}.metadata.json"
            fi
            
            # Clean up temp directory
            rm -rf "$temp_configs_dir"
            return 0
        else
            print_status $RED "Failed to create configs backup"
            rm -rf "$temp_configs_dir"
            return 1
        fi
    else
        print_status $YELLOW "No configuration files found to backup"
        rm -rf "$temp_configs_dir"
        return 0
    fi
}

# Function to collect Docker configs
collect_docker_configs() {
    local temp_dir=$1
    local docker_configs_dir="${temp_dir}/docker"
    
    mkdir -p "$docker_configs_dir"
    
    print_status $YELLOW "  Collecting Docker configurations..."
    
    # Copy docker-compose files
    if [ -f "/app/docker-compose.yml" ]; then
        cp "/app/docker-compose.yml" "${docker_configs_dir}/" 2>/dev/null || true
    fi
    
    if [ -f "/app/docker-compose.prod.yml" ]; then
        cp "/app/docker-compose.prod.yml" "${docker_configs_dir}/" 2>/dev/null || true
    fi
    
    if [ -f "/app/docker-compose.override.yml" ]; then
        cp "/app/docker-compose.override.yml" "${docker_configs_dir}/" 2>/dev/null || true
    fi
    
    # Copy Dockerfiles
    if [ -f "/app/Dockerfile.backend" ]; then
        cp "/app/Dockerfile.backend" "${docker_configs_dir}/" 2>/dev/null || true
    fi
    
    if [ -f "/app/Dockerfile.frontend" ]; then
        cp "/app/Dockerfile.frontend" "${docker_configs_dir}/" 2>/dev/null || true
    fi
    
    if [ -f "/app/Dockerfile.ai-service" ]; then
        cp "/app/Dockerfile.ai-service" "${docker_configs_dir}/" 2>/dev/null || true
    fi
}

# Function to collect application configs
collect_app_configs() {
    local temp_dir=$1
    local app_configs_dir="${temp_dir}/application"
    
    mkdir -p "$app_configs_dir"
    
    print_status $YELLOW "  Collecting application configurations..."
    
    # Backend configuration files
    docker run --rm \
        -v austa-backend:/app:ro \
        -v "${app_configs_dir}:/backup" \
        alpine:latest \
        sh -c "find /app -name '*.json' -o -name '*.yaml' -o -name '*.yml' -o -name '*.env*' | head -20 | xargs -I {} cp {} /backup/ 2>/dev/null || true"
    
    # AI service configuration files
    docker run --rm \
        -v austa-ai-service:/app:ro \
        -v "${app_configs_dir}:/backup" \
        alpine:latest \
        sh -c "find /app -name '*.yaml' -o -name '*.yml' -o -name '*.json' | head -10 | xargs -I {} cp {} /backup/ 2>/dev/null || true"
}

# Function to collect nginx configs
collect_nginx_configs() {
    local temp_dir=$1
    local nginx_configs_dir="${temp_dir}/nginx"
    
    mkdir -p "$nginx_configs_dir"
    
    print_status $YELLOW "  Collecting Nginx configurations..."
    
    # Copy nginx config files
    if [ -f "/app/docker/nginx.conf" ]; then
        cp "/app/docker/nginx.conf" "${nginx_configs_dir}/" 2>/dev/null || true
    fi
    
    if [ -f "/app/docker/nginx-prod.conf" ]; then
        cp "/app/docker/nginx-prod.conf" "${nginx_configs_dir}/" 2>/dev/null || true
    fi
    
    if [ -f "/app/docker/nginx-lb.conf" ]; then
        cp "/app/docker/nginx-lb.conf" "${nginx_configs_dir}/" 2>/dev/null || true
    fi
}

# Function to backup cache data
backup_cache() {
    print_status $YELLOW "Backing up cache data..."
    
    local cache_archive="cache_backup_${TIMESTAMP}.tar.gz"
    local cache_path="${CACHE_BACKUP_DIR}/${cache_archive}"
    
    # AI models cache
    if docker volume inspect ai-cache >/dev/null 2>&1; then
        docker run --rm \
            -v ai-cache:/data:ro \
            -v "${CACHE_BACKUP_DIR}:/backup" \
            alpine:latest \
            tar -czf "/backup/${cache_archive}" /data/
        
        if [ $? -eq 0 ] && [ -f "$cache_path" ]; then
            local file_size=$(du -sh "$cache_path" | cut -f1)
            print_status $GREEN "Cache backup completed: ${cache_archive} (${file_size})"
            
            # Create metadata
            create_backup_metadata "cache" "$cache_archive" "$cache_path"
            
            # Upload to S3 (optional for cache)
            if [ ! -z "$S3_BUCKET" ] && [ "$BACKUP_CACHE_TO_S3" = "true" ]; then
                aws s3 cp "$cache_path" "s3://${S3_BUCKET}/application-data/cache/${cache_archive}"
                aws s3 cp "${cache_path}.metadata.json" "s3://${S3_BUCKET}/application-data/cache/${cache_archive}.metadata.json"
            fi
            
            return 0
        else
            print_status $RED "Failed to create cache backup"
            return 1
        fi
    else
        print_status $YELLOW "Cache volume not found, skipping"
        return 0
    fi
}

# Function to export application reports and analytics
backup_reports() {
    print_status $YELLOW "Exporting application reports and analytics..."
    
    local reports_archive="reports_backup_${TIMESTAMP}.tar.gz"
    local reports_path="${REPORTS_BACKUP_DIR}/${reports_archive}"
    local temp_reports_dir="/tmp/reports_backup_${TIMESTAMP}"
    
    mkdir -p "$temp_reports_dir"
    
    # Export reports from database
    export_database_reports "$temp_reports_dir"
    export_analytics_data "$temp_reports_dir"
    export_audit_logs "$temp_reports_dir"
    
    # Create compressed archive
    if [ "$(ls -A $temp_reports_dir)" ]; then
        tar -czf "$reports_path" -C "$temp_reports_dir" .
        
        if [ $? -eq 0 ]; then
            local file_size=$(du -sh "$reports_path" | cut -f1)
            print_status $GREEN "Reports backup completed: ${reports_archive} (${file_size})"
            
            # Create metadata
            create_backup_metadata "reports" "$reports_archive" "$reports_path"
            
            # Upload to S3
            if [ ! -z "$S3_BUCKET" ]; then
                aws s3 cp "$reports_path" "s3://${S3_BUCKET}/application-data/reports/${reports_archive}"
                aws s3 cp "${reports_path}.metadata.json" "s3://${S3_BUCKET}/application-data/reports/${reports_archive}.metadata.json"
            fi
            
            # Clean up temp directory
            rm -rf "$temp_reports_dir"
            return 0
        else
            print_status $RED "Failed to create reports backup"
            rm -rf "$temp_reports_dir"
            return 1
        fi
    else
        print_status $YELLOW "No reports data found to backup"
        rm -rf "$temp_reports_dir"
        return 0
    fi
}

# Function to export database reports
export_database_reports() {
    local temp_dir=$1
    local db_reports_dir="${temp_dir}/database-reports"
    
    mkdir -p "$db_reports_dir"
    
    print_status $YELLOW "  Exporting database reports..."
    
    # Parse DATABASE_URL
    if [ ! -z "$DATABASE_URL" ]; then
        if [[ $DATABASE_URL =~ postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/(.+) ]]; then
            local db_user="${BASH_REMATCH[1]}"
            local db_pass="${BASH_REMATCH[2]}"
            local db_host="${BASH_REMATCH[3]}"
            local db_port="${BASH_REMATCH[4]}"
            local db_name="${BASH_REMATCH[5]}"
            
            export PGPASSWORD="${db_pass}"
            
            # Export case statistics
            psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" \
                -c "COPY (SELECT * FROM case_statistics WHERE created_at > NOW() - INTERVAL '30 days') TO STDOUT WITH CSV HEADER" \
                > "${db_reports_dir}/case_statistics_${TIMESTAMP}.csv" 2>/dev/null || true
            
            # Export audit reports
            psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" \
                -c "COPY (SELECT * FROM audit_logs WHERE created_at > NOW() - INTERVAL '7 days') TO STDOUT WITH CSV HEADER" \
                > "${db_reports_dir}/audit_logs_${TIMESTAMP}.csv" 2>/dev/null || true
            
            # Export user activity reports
            psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" \
                -c "COPY (SELECT user_id, action, created_at FROM user_activities WHERE created_at > NOW() - INTERVAL '30 days') TO STDOUT WITH CSV HEADER" \
                > "${db_reports_dir}/user_activities_${TIMESTAMP}.csv" 2>/dev/null || true
        fi
    fi
}

# Function to export analytics data
export_analytics_data() {
    local temp_dir=$1
    local analytics_dir="${temp_dir}/analytics"
    
    mkdir -p "$analytics_dir"
    
    print_status $YELLOW "  Exporting analytics data..."
    
    # Export analytics from MongoDB
    if [ ! -z "$MONGODB_URL" ]; then
        local mongo_host="mongodb"
        local mongo_port="27017"
        local mongo_db="austa_logs"
        
        # Export analytics collections
        mongoexport --host "${mongo_host}:${mongo_port}" \
            --db "$mongo_db" --collection "page_views" \
            --out "${analytics_dir}/page_views_${TIMESTAMP}.json" 2>/dev/null || true
        
        mongoexport --host "${mongo_host}:${mongo_port}" \
            --db "$mongo_db" --collection "user_sessions" \
            --out "${analytics_dir}/user_sessions_${TIMESTAMP}.json" 2>/dev/null || true
        
        mongoexport --host "${mongo_host}:${mongo_port}" \
            --db "$mongo_db" --collection "performance_metrics" \
            --out "${analytics_dir}/performance_metrics_${TIMESTAMP}.json" 2>/dev/null || true
    fi
}

# Function to export audit logs
export_audit_logs() {
    local temp_dir=$1
    local audit_dir="${temp_dir}/audit-logs"
    
    mkdir -p "$audit_dir"
    
    print_status $YELLOW "  Exporting audit logs..."
    
    # Export audit trails from MongoDB
    if [ ! -z "$MONGODB_URL" ]; then
        local mongo_host="mongodb"
        local mongo_port="27017"
        local mongo_db="austa_logs"
        
        mongoexport --host "${mongo_host}:${mongo_port}" \
            --db "$mongo_db" --collection "audit_trail" \
            --query '{"timestamp": {"$gte": {"$date": "'$(date -d '30 days ago' --iso-8601)'"} }}' \
            --out "${audit_dir}/audit_trail_${TIMESTAMP}.json" 2>/dev/null || true
    fi
}

# Function to create backup metadata
create_backup_metadata() {
    local backup_type=$1
    local backup_name=$2
    local backup_path=$3
    local metadata_file="${backup_path}.metadata.json"
    
    local file_size=$(stat -f%z "$backup_path" 2>/dev/null || stat -c%s "$backup_path" 2>/dev/null || echo "unknown")
    
    cat > "$metadata_file" << EOF
{
    "backup_name": "${backup_name}",
    "backup_type": "${backup_type}",
    "timestamp": "${TIMESTAMP}",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "backup_path": "${backup_path}",
    "file_size_bytes": ${file_size},
    "file_size_human": "$(du -sh "$backup_path" | cut -f1)",
    "compression": "gzip",
    "description": "AUSTA Cockpit application data backup"
}
EOF
    
    print_status $YELLOW "Metadata created: ${metadata_file}"
}

# Function to clean up old backups
cleanup_old_backups() {
    print_status $YELLOW "Cleaning up old application data backups (retention: ${RETENTION_DAYS} days)..."
    
    # Clean up each backup type
    find "${UPLOADS_BACKUP_DIR}" -name "uploads_backup_*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    find "${LOGS_BACKUP_DIR}" -name "logs_backup_*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    find "${CONFIG_BACKUP_DIR}" -name "configs_backup_*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    find "${CACHE_BACKUP_DIR}" -name "cache_backup_*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    find "${REPORTS_BACKUP_DIR}" -name "reports_backup_*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    
    # Clean up metadata files
    find "${BACKUP_DIR}" -name "*.metadata.json" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    
    print_status $GREEN "Cleanup completed"
}

# Function to generate backup report
generate_backup_report() {
    local report_file="${BACKUP_DIR}/application_data_backup_report_${TIMESTAMP}.json"
    
    # Count backups for each type
    local uploads_count=$(find "${UPLOADS_BACKUP_DIR}" -name "uploads_backup_*.tar.gz" -type f | wc -l)
    local logs_count=$(find "${LOGS_BACKUP_DIR}" -name "logs_backup_*.tar.gz" -type f | wc -l)
    local configs_count=$(find "${CONFIG_BACKUP_DIR}" -name "configs_backup_*.tar.gz" -type f | wc -l)
    local cache_count=$(find "${CACHE_BACKUP_DIR}" -name "cache_backup_*.tar.gz" -type f | wc -l)
    local reports_count=$(find "${REPORTS_BACKUP_DIR}" -name "reports_backup_*.tar.gz" -type f | wc -l)
    local total_size=$(du -sh "${BACKUP_DIR}" | cut -f1)
    
    cat > "${report_file}" << EOF
{
    "report_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "backup_type": "application_data_multi_component",
    "status": "completed",
    "statistics": {
        "uploads_backups_count": ${uploads_count},
        "logs_backups_count": ${logs_count},
        "configs_backups_count": ${configs_count},
        "cache_backups_count": ${cache_count},
        "reports_backups_count": ${reports_count},
        "total_backup_size": "${total_size}",
        "retention_days": ${RETENTION_DAYS}
    },
    "latest_backups": {
        "uploads": "uploads_backup_${TIMESTAMP}.tar.gz",
        "logs": "logs_backup_${TIMESTAMP}.tar.gz",
        "configs": "configs_backup_${TIMESTAMP}.tar.gz",
        "cache": "cache_backup_${TIMESTAMP}.tar.gz",
        "reports": "reports_backup_${TIMESTAMP}.tar.gz"
    },
    "next_backup": "$(date -d '+1 day' '+%Y-%m-%d 02:00:00')"
}
EOF
    
    print_status $GREEN "Application data backup report generated: ${report_file}"
    
    # Upload report to S3
    if [ ! -z "$S3_BUCKET" ]; then
        aws s3 cp "${report_file}" "s3://${S3_BUCKET}/application-data/reports/"
    fi
}

# Main execution
main() {
    local backup_type="${1:-all}"
    
    case "$backup_type" in
        "uploads")
            backup_uploads
            ;;
        "logs")
            backup_logs
            ;;
        "configs")
            backup_configs
            ;;
        "cache")
            backup_cache
            ;;
        "reports")
            backup_reports
            ;;
        "all")
            backup_uploads
            backup_logs
            backup_configs
            backup_cache
            backup_reports
            ;;
        *)
            echo "Usage: $0 {uploads|logs|configs|cache|reports|all}"
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

print_status $GREEN "Application data backup process completed at $(date)"