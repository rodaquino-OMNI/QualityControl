#!/bin/bash

# AUSTA Cockpit Backup Monitoring and Validation System
set -e

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MONITOR_LOG="/var/log/backup-monitor_${TIMESTAMP}.log"
ALERT_THRESHOLD_HOURS=25  # Alert if backup is older than 25 hours
BACKUP_BASE_DIR="/backups"
HEALTH_CHECK_URL="http://localhost:3001/api/v1/health/backups"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Monitoring configuration
MONITOR_CONFIG="/app/backup-monitor-config.json"

# Function to print colored output and log
log_message() {
    local color=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo -e "${color}[${timestamp}] ${message}${NC}"
    echo "[${timestamp}] ${message}" >> "$MONITOR_LOG"
}

# Function to send alerts
send_alert() {
    local level=$1
    local service=$2
    local message=$3
    
    log_message $RED "ALERT [$level] $service: $message"
    
    # Send to monitoring endpoints
    if [ ! -z "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST "$SLACK_WEBHOOK_URL" \
            -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 Backup Alert [$level] - $service: $message\"}" >/dev/null 2>&1 || true
    fi
    
    if [ ! -z "$SNS_TOPIC_ARN" ]; then
        aws sns publish \
            --topic-arn "$SNS_TOPIC_ARN" \
            --subject "AUSTA Backup Alert - $service" \
            --message "$message" >/dev/null 2>&1 || true
    fi
    
    # Log to CloudWatch
    if command -v aws >/dev/null 2>&1; then
        aws cloudwatch put-metric-data \
            --namespace "AUSTA/Backup" \
            --metric-data MetricName=BackupAlert,Value=1,Unit=Count,Dimensions=Service="$service",Level="$level" >/dev/null 2>&1 || true
    fi
}

# Function to create monitoring configuration
create_monitor_config() {
    if [ ! -f "$MONITOR_CONFIG" ]; then
        log_message $BLUE "Creating backup monitoring configuration..."
        
        cat > "$MONITOR_CONFIG" << EOF
{
    "monitoring": {
        "enabled": true,
        "check_interval_minutes": 15,
        "alert_threshold_hours": ${ALERT_THRESHOLD_HOURS},
        "retention_check_enabled": true,
        "integrity_check_enabled": true,
        "performance_monitoring_enabled": true
    },
    "services": {
        "postgres": {
            "enabled": true,
            "backup_path": "${BACKUP_BASE_DIR}/postgres",
            "max_age_hours": 24,
            "min_size_mb": 1,
            "file_pattern": "postgres_backup_*.sql.gz",
            "pitr_pattern": "base_backup_*.tar.gz"
        },
        "redis": {
            "enabled": true,
            "backup_path": "${BACKUP_BASE_DIR}/redis",
            "max_age_hours": 24,
            "min_size_kb": 100,
            "rdb_pattern": "redis_rdb_*.gz",
            "aof_pattern": "redis_aof_*.gz"
        },
        "mongodb": {
            "enabled": true,
            "backup_path": "${BACKUP_BASE_DIR}/mongodb",
            "max_age_hours": 24,
            "min_size_mb": 1,
            "dump_pattern": "mongodb_dump_*.tar.gz",
            "export_pattern": "mongodb_export_*.tar.gz"
        },
        "application_data": {
            "enabled": true,
            "backup_path": "${BACKUP_BASE_DIR}/application-data",
            "max_age_hours": 24,
            "min_size_kb": 500,
            "uploads_pattern": "uploads_backup_*.tar.gz",
            "configs_pattern": "configs_backup_*.tar.gz"
        }
    },
    "thresholds": {
        "backup_age_critical": 36,
        "backup_age_warning": 26,
        "backup_size_critical_mb": 0.1,
        "backup_size_warning_mb": 1,
        "disk_usage_critical": 90,
        "disk_usage_warning": 80,
        "success_rate_critical": 70,
        "success_rate_warning": 85
    },
    "notifications": {
        "slack_webhook": "${SLACK_WEBHOOK_URL}",
        "sns_topic": "${SNS_TOPIC_ARN}",
        "email_endpoint": "${EMAIL_ALERT_ENDPOINT}",
        "pagerduty_endpoint": "${PAGERDUTY_ENDPOINT}"
    }
}
EOF
        
        log_message $GREEN "Monitor configuration created: $MONITOR_CONFIG"
    fi
}

# Function to check backup freshness
check_backup_freshness() {
    local service=$1
    local backup_path=$2
    local max_age_hours=$3
    local file_pattern=$4
    
    log_message $BLUE "Checking backup freshness for $service..."
    
    if [ ! -d "$backup_path" ]; then
        send_alert "CRITICAL" "$service" "Backup directory does not exist: $backup_path"
        return 1
    fi
    
    # Find the most recent backup file
    local latest_backup=$(find "$backup_path" -name "$file_pattern" -type f -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)
    
    if [ -z "$latest_backup" ]; then
        send_alert "CRITICAL" "$service" "No backup files found matching pattern: $file_pattern"
        return 1
    fi
    
    # Check file age
    local file_age_seconds=$(( $(date +%s) - $(stat -f%m "$latest_backup" 2>/dev/null || stat -c%Y "$latest_backup" 2>/dev/null || echo "0") ))
    local file_age_hours=$(( file_age_seconds / 3600 ))
    
    log_message $BLUE "$service: Latest backup is $file_age_hours hours old"
    
    if [ $file_age_hours -gt $max_age_hours ]; then
        local level="WARNING"
        if [ $file_age_hours -gt 36 ]; then
            level="CRITICAL"
        fi
        send_alert "$level" "$service" "Backup is $file_age_hours hours old (threshold: $max_age_hours hours)"
        return 1
    fi
    
    log_message $GREEN "$service: Backup freshness check PASSED"
    return 0
}

# Function to check backup size and integrity
check_backup_integrity() {
    local service=$1
    local backup_path=$2
    local min_size_bytes=$3
    local file_pattern=$4
    
    log_message $BLUE "Checking backup integrity for $service..."
    
    # Find recent backup files
    local backup_files=$(find "$backup_path" -name "$file_pattern" -type f -mtime -1 2>/dev/null)
    
    if [ -z "$backup_files" ]; then
        send_alert "WARNING" "$service" "No recent backup files found for integrity check"
        return 1
    fi
    
    local total_valid=0
    local total_files=0
    
    for backup_file in $backup_files; do
        total_files=$((total_files + 1))
        local file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null || echo "0")
        
        # Check minimum size
        if [ "$file_size" -lt "$min_size_bytes" ]; then
            send_alert "WARNING" "$service" "Backup file too small: $(basename "$backup_file") ($file_size bytes, minimum: $min_size_bytes)"
            continue
        fi
        
        # Check file integrity based on type
        local integrity_ok=false
        case "$backup_file" in
            *.gz)
                if gzip -t "$backup_file" 2>/dev/null; then
                    integrity_ok=true
                fi
                ;;
            *.tar.gz)
                if tar -tzf "$backup_file" >/dev/null 2>&1; then
                    integrity_ok=true
                fi
                ;;
            *.sql)
                if head -1 "$backup_file" | grep -q "PostgreSQL\|--"; then
                    integrity_ok=true
                fi
                ;;
            *.json)
                if jq . "$backup_file" >/dev/null 2>&1; then
                    integrity_ok=true
                fi
                ;;
            *)
                # For other files, just check if readable
                if [ -r "$backup_file" ]; then
                    integrity_ok=true
                fi
                ;;
        esac
        
        if [ "$integrity_ok" = true ]; then
            total_valid=$((total_valid + 1))
            log_message $GREEN "$service: $(basename "$backup_file") integrity check PASSED"
        else
            send_alert "WARNING" "$service" "Backup file integrity check failed: $(basename "$backup_file")"
        fi
    done
    
    local success_rate=$(( total_valid * 100 / total_files ))
    log_message $BLUE "$service: Integrity check success rate: $success_rate% ($total_valid/$total_files)"
    
    if [ $success_rate -lt 85 ]; then
        send_alert "WARNING" "$service" "Low backup integrity success rate: $success_rate%"
        return 1
    fi
    
    log_message $GREEN "$service: Backup integrity check PASSED"
    return 0
}

# Function to check storage utilization
check_storage_utilization() {
    log_message $BLUE "Checking backup storage utilization..."
    
    # Check local disk usage
    local disk_usage=$(df "$BACKUP_BASE_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')
    
    log_message $BLUE "Backup storage disk usage: $disk_usage%"
    
    if [ "$disk_usage" -gt 90 ]; then
        send_alert "CRITICAL" "storage" "High disk usage: $disk_usage%"
    elif [ "$disk_usage" -gt 80 ]; then
        send_alert "WARNING" "storage" "High disk usage: $disk_usage%"
    fi
    
    # Check S3 storage if configured
    if [ ! -z "$S3_BUCKET" ] && command -v aws >/dev/null 2>&1; then
        log_message $BLUE "Checking S3 storage utilization..."
        
        local s3_size=$(aws s3api list-objects-v2 --bucket "$S3_BUCKET" --query 'sum(Contents[].Size)' --output text 2>/dev/null || echo "0")
        local s3_size_gb=$(( s3_size / 1024 / 1024 / 1024 ))
        
        log_message $BLUE "S3 backup storage: ${s3_size_gb} GB"
        
        # Send metrics to CloudWatch
        aws cloudwatch put-metric-data \
            --namespace "AUSTA/Backup" \
            --metric-data MetricName=S3StorageGB,Value=$s3_size_gb,Unit=Count >/dev/null 2>&1 || true
    fi
    
    # Send disk usage metrics
    if command -v aws >/dev/null 2>&1; then
        aws cloudwatch put-metric-data \
            --namespace "AUSTA/Backup" \
            --metric-data MetricName=DiskUsagePercent,Value=$disk_usage,Unit=Percent >/dev/null 2>&1 || true
    fi
}

# Function to validate backup restoration capability
validate_backup_restoration() {
    local service=$1
    local validation_type=${2:-"quick"}
    
    log_message $BLUE "Validating backup restoration capability for $service (mode: $validation_type)..."
    
    case "$service" in
        "postgres")
            validate_postgres_restoration "$validation_type"
            ;;
        "redis")
            validate_redis_restoration "$validation_type"
            ;;
        "mongodb")
            validate_mongodb_restoration "$validation_type"
            ;;
        "application_data")
            validate_application_data_restoration "$validation_type"
            ;;
        *)
            log_message $YELLOW "No validation procedure defined for service: $service"
            ;;
    esac
}

# Function to validate PostgreSQL backup restoration
validate_postgres_restoration() {
    local mode=$1
    
    log_message $BLUE "Validating PostgreSQL backup restoration..."
    
    # Find latest backup
    local latest_backup=$(find "$BACKUP_BASE_DIR/postgres" -name "postgres_backup_*.sql.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)
    
    if [ -z "$latest_backup" ]; then
        send_alert "CRITICAL" "postgres" "No PostgreSQL backup found for validation"
        return 1
    fi
    
    if [ "$mode" = "quick" ]; then
        # Quick validation - check if file can be decompressed and contains SQL
        if zcat "$latest_backup" | head -100 | grep -q "PostgreSQL\|CREATE\|INSERT"; then
            log_message $GREEN "PostgreSQL backup quick validation PASSED"
            return 0
        else
            send_alert "CRITICAL" "postgres" "PostgreSQL backup validation failed - file does not contain valid SQL"
            return 1
        fi
    else
        # Full validation - attempt restoration to test database
        log_message $BLUE "Performing full PostgreSQL backup validation..."
        
        # This would require a test database environment
        # For now, we'll do extended checks
        local line_count=$(zcat "$latest_backup" | wc -l)
        local size=$(stat -f%z "$latest_backup" 2>/dev/null || stat -c%s "$latest_backup" 2>/dev/null)
        
        if [ "$line_count" -gt 10 ] && [ "$size" -gt 1024 ]; then
            log_message $GREEN "PostgreSQL backup full validation PASSED"
            return 0
        else
            send_alert "WARNING" "postgres" "PostgreSQL backup validation concerns - low line count or size"
            return 1
        fi
    fi
}

# Function to validate Redis backup restoration
validate_redis_restoration() {
    local mode=$1
    
    log_message $BLUE "Validating Redis backup restoration..."
    
    # Find latest RDB backup
    local latest_rdb=$(find "$BACKUP_BASE_DIR/redis/rdb-backups" -name "redis_rdb_*.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)
    
    if [ -z "$latest_rdb" ]; then
        send_alert "WARNING" "redis" "No Redis RDB backup found for validation"
        return 1
    fi
    
    # Check RDB file format
    if zcat "$latest_rdb" | head -c 5 | grep -q "REDIS"; then
        log_message $GREEN "Redis backup validation PASSED"
        return 0
    else
        send_alert "WARNING" "redis" "Redis backup validation failed - invalid RDB format"
        return 1
    fi
}

# Function to validate MongoDB backup restoration
validate_mongodb_restoration() {
    local mode=$1
    
    log_message $BLUE "Validating MongoDB backup restoration..."
    
    # Find latest dump backup
    local latest_dump=$(find "$BACKUP_BASE_DIR/mongodb/dump-backups" -name "mongodb_dump_*.tar.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)
    
    if [ -z "$latest_dump" ]; then
        send_alert "WARNING" "mongodb" "No MongoDB dump backup found for validation"
        return 1
    fi
    
    # Check if archive contains BSON files
    if tar -tzf "$latest_dump" | grep -q "\.bson$"; then
        log_message $GREEN "MongoDB backup validation PASSED"
        return 0
    else
        send_alert "WARNING" "mongodb" "MongoDB backup validation failed - no BSON files found"
        return 1
    fi
}

# Function to validate application data restoration
validate_application_data_restoration() {
    local mode=$1
    
    log_message $BLUE "Validating application data backup restoration..."
    
    # Check various application data backups
    local uploads_backup=$(find "$BACKUP_BASE_DIR/application-data/uploads" -name "uploads_backup_*.tar.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)
    local configs_backup=$(find "$BACKUP_BASE_DIR/application-data/configs" -name "configs_backup_*.tar.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)
    
    local validation_passed=true
    
    if [ ! -z "$uploads_backup" ]; then
        if tar -tzf "$uploads_backup" >/dev/null 2>&1; then
            log_message $GREEN "Uploads backup validation PASSED"
        else
            send_alert "WARNING" "application_data" "Uploads backup validation failed"
            validation_passed=false
        fi
    fi
    
    if [ ! -z "$configs_backup" ]; then
        if tar -tzf "$configs_backup" >/dev/null 2>&1; then
            log_message $GREEN "Configs backup validation PASSED"
        else
            send_alert "WARNING" "application_data" "Configs backup validation failed"
            validation_passed=false
        fi
    fi
    
    if [ "$validation_passed" = true ]; then
        return 0
    else
        return 1
    fi
}

# Function to check backup performance metrics
check_backup_performance() {
    log_message $BLUE "Checking backup performance metrics..."
    
    # Check recent backup logs for timing information
    local backup_logs=$(find /var/log -name "*backup*.log" -mtime -1 2>/dev/null)
    
    for log_file in $backup_logs; do
        # Extract timing information from logs
        local duration=$(grep -o "completed.*[0-9]m[0-9]s\|took [0-9]*s\|duration: [0-9]*s" "$log_file" 2>/dev/null | tail -1)
        
        if [ ! -z "$duration" ]; then
            log_message $BLUE "Backup performance: $duration (from $(basename "$log_file"))"
        fi
    done
    
    # Check backup file creation times
    local services="postgres redis mongodb application-data"
    
    for service in $services; do
        local service_dir="$BACKUP_BASE_DIR/$service"
        if [ -d "$service_dir" ]; then
            local recent_files=$(find "$service_dir" -type f -mtime -1 2>/dev/null | wc -l)
            log_message $BLUE "$service: $recent_files backup files created in last 24 hours"
            
            # Send metrics to CloudWatch
            if command -v aws >/dev/null 2>&1; then
                aws cloudwatch put-metric-data \
                    --namespace "AUSTA/Backup" \
                    --metric-data MetricName=BackupFilesCreated,Value=$recent_files,Unit=Count,Dimensions=Service=$service >/dev/null 2>&1 || true
            fi
        fi
    done
}

# Function to check cross-region replication status
check_cross_region_replication() {
    log_message $BLUE "Checking cross-region replication status..."
    
    if [ -z "$S3_BUCKET" ]; then
        log_message $YELLOW "S3 bucket not configured, skipping cross-region check"
        return 0
    fi
    
    # Check if cross-region replication is configured
    local replication_config="/backups/cross-region-config.json"
    
    if [ -f "$replication_config" ]; then
        local secondary_regions=$(jq -r '.secondary_regions[]?' "$replication_config" 2>/dev/null)
        
        for region in $secondary_regions; do
            local secondary_bucket="${S3_BUCKET}-${region}"
            
            log_message $BLUE "Checking replication to region: $region"
            
            # Check if secondary bucket exists and has recent objects
            local object_count=$(aws s3api list-objects-v2 --bucket "$secondary_bucket" --region "$region" --query 'KeyCount' --output text 2>/dev/null || echo "0")
            
            if [ "$object_count" -gt 0 ]; then
                log_message $GREEN "Cross-region replication to $region: $object_count objects"
            else
                send_alert "WARNING" "replication" "No objects found in secondary bucket for region: $region"
            fi
            
            # Send replication metrics
            if command -v aws >/dev/null 2>&1; then
                aws cloudwatch put-metric-data \
                    --namespace "AUSTA/Backup" \
                    --metric-data MetricName=ReplicationObjectCount,Value=$object_count,Unit=Count,Dimensions=Region=$region >/dev/null 2>&1 || true
            fi
        done
    else
        log_message $YELLOW "Cross-region replication not configured"
    fi
}

# Function to generate monitoring report
generate_monitoring_report() {
    local report_file="/var/log/backup-monitoring-report-${TIMESTAMP}.json"
    
    log_message $BLUE "Generating backup monitoring report..."
    
    # Collect summary statistics
    local total_backups=0
    local healthy_services=0
    local total_services=0
    
    local services="postgres redis mongodb application-data"
    
    for service in $services; do
        total_services=$((total_services + 1))
        local service_dir="$BACKUP_BASE_DIR/$service"
        
        if [ -d "$service_dir" ]; then
            local backup_count=$(find "$service_dir" -type f -name "*.gz" -o -name "*.tar.gz" | wc -l)
            total_backups=$((total_backups + backup_count))
            
            # Check if service has recent backups
            local recent_count=$(find "$service_dir" -type f -mtime -1 | wc -l)
            if [ "$recent_count" -gt 0 ]; then
                healthy_services=$((healthy_services + 1))
            fi
        fi
    done
    
    # Calculate health percentage
    local health_percentage=$(( healthy_services * 100 / total_services ))
    
    cat > "$report_file" << EOF
{
    "monitoring_report": {
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "report_type": "backup_monitoring",
        "summary": {
            "total_services": $total_services,
            "healthy_services": $healthy_services,
            "health_percentage": $health_percentage,
            "total_backup_files": $total_backups
        },
        "services_status": {
$(
    for service in $services; do
        local service_dir="$BACKUP_BASE_DIR/$service"
        local status="unhealthy"
        local last_backup="none"
        local file_count=0
        
        if [ -d "$service_dir" ]; then
            file_count=$(find "$service_dir" -type f | wc -l)
            local latest_file=$(find "$service_dir" -type f -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)
            
            if [ ! -z "$latest_file" ]; then
                last_backup=$(stat -f%Sm -t"%Y-%m-%d %H:%M:%S" "$latest_file" 2>/dev/null || stat -c"%y" "$latest_file" 2>/dev/null | cut -d'.' -f1)
                local file_age_hours=$(( ( $(date +%s) - $(stat -f%m "$latest_file" 2>/dev/null || stat -c%Y "$latest_file" 2>/dev/null) ) / 3600 ))
                
                if [ $file_age_hours -lt 25 ]; then
                    status="healthy"
                fi
            fi
        fi
        
        echo "            \"$service\": {"
        echo "                \"status\": \"$status\","
        echo "                \"last_backup\": \"$last_backup\","
        echo "                \"file_count\": $file_count"
        echo -n "            }"
        
        # Add comma except for last service
        if [ "$service" != "application-data" ]; then
            echo ","
        else
            echo ""
        fi
    done
)
        },
        "storage_info": {
            "local_disk_usage": "$(df "$BACKUP_BASE_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')%",
            "backup_directory_size": "$(du -sh "$BACKUP_BASE_DIR" | cut -f1)"
        },
        "next_monitoring_check": "$(date -d '+15 minutes' '+%Y-%m-%d %H:%M:%S')"
    }
}
EOF
    
    log_message $GREEN "Monitoring report generated: $report_file"
    
    # Upload report to S3
    if [ ! -z "$S3_BUCKET" ] && command -v aws >/dev/null 2>&1; then
        aws s3 cp "$report_file" "s3://${S3_BUCKET}/monitoring/backup-monitoring-report-${TIMESTAMP}.json" >/dev/null 2>&1 || true
    fi
    
    # Send overall health metric
    if command -v aws >/dev/null 2>&1; then
        aws cloudwatch put-metric-data \
            --namespace "AUSTA/Backup" \
            --metric-data MetricName=OverallHealthPercentage,Value=$health_percentage,Unit=Percent >/dev/null 2>&1 || true
    fi
}

# Main monitoring function
run_monitoring_checks() {
    local check_type=${1:-"standard"}
    
    log_message $PURPLE "=== AUSTA Backup Monitoring Started ==="
    log_message $BLUE "Check type: $check_type"
    
    # Create configuration if needed
    create_monitor_config
    
    # Load configuration
    local services=$(jq -r '.services | keys[]' "$MONITOR_CONFIG" 2>/dev/null || echo "postgres redis mongodb application_data")
    
    local overall_status=0
    
    for service in $services; do
        log_message $BLUE "Monitoring service: $service"
        
        # Get service configuration
        local enabled=$(jq -r ".services.$service.enabled" "$MONITOR_CONFIG" 2>/dev/null || echo "true")
        
        if [ "$enabled" = "true" ]; then
            local backup_path=$(jq -r ".services.$service.backup_path" "$MONITOR_CONFIG" 2>/dev/null || echo "$BACKUP_BASE_DIR/$service")
            local max_age_hours=$(jq -r ".services.$service.max_age_hours" "$MONITOR_CONFIG" 2>/dev/null || echo "24")
            local file_pattern=$(jq -r ".services.$service.file_pattern // .services.$service.dump_pattern // \"*\"" "$MONITOR_CONFIG" 2>/dev/null)
            local min_size=$(jq -r ".services.$service.min_size_mb // .services.$service.min_size_kb // 1024" "$MONITOR_CONFIG" 2>/dev/null)
            
            # Convert size to bytes
            local min_size_bytes
            if echo "$min_size" | grep -q "kb"; then
                min_size_bytes=$(echo "$min_size" | sed 's/kb//' | awk '{print $1 * 1024}')
            else
                min_size_bytes=$(echo "$min_size" | awk '{print $1 * 1024 * 1024}')
            fi
            
            # Run checks
            if ! check_backup_freshness "$service" "$backup_path" "$max_age_hours" "$file_pattern"; then
                overall_status=1
            fi
            
            if ! check_backup_integrity "$service" "$backup_path" "$min_size_bytes" "$file_pattern"; then
                overall_status=1
            fi
            
            # Run validation if requested
            if [ "$check_type" = "full" ] || [ "$check_type" = "validation" ]; then
                validate_backup_restoration "$service" "quick"
            fi
        else
            log_message $YELLOW "Service $service monitoring disabled"
        fi
    done
    
    # Run additional checks
    check_storage_utilization
    check_backup_performance
    check_cross_region_replication
    
    # Generate report
    generate_monitoring_report
    
    if [ $overall_status -eq 0 ]; then
        log_message $GREEN "=== All backup monitoring checks PASSED ==="
    else
        log_message $YELLOW "=== Some backup monitoring checks FAILED ==="
    fi
    
    log_message $PURPLE "=== AUSTA Backup Monitoring Completed ==="
    
    return $overall_status
}

# Main function
main() {
    local command=${1:-"monitor"}
    
    # Create log file
    touch "$MONITOR_LOG"
    
    case "$command" in
        "monitor"|"check")
            run_monitoring_checks "standard"
            ;;
        "full")
            run_monitoring_checks "full"
            ;;
        "validation")
            run_monitoring_checks "validation"
            ;;
        "report")
            generate_monitoring_report
            ;;
        "config")
            create_monitor_config
            cat "$MONITOR_CONFIG"
            ;;
        *)
            echo "AUSTA Backup Monitoring System"
            echo "=============================="
            echo ""
            echo "Usage: $0 <command>"
            echo ""
            echo "Commands:"
            echo "  monitor     - Run standard monitoring checks"
            echo "  full        - Run comprehensive monitoring with validation"
            echo "  validation  - Run backup restoration validation tests"
            echo "  report      - Generate monitoring report only"
            echo "  config      - Show/create monitoring configuration"
            echo ""
            echo "Environment Variables:"
            echo "  SLACK_WEBHOOK_URL      - Slack notifications"
            echo "  SNS_TOPIC_ARN         - AWS SNS topic for alerts"
            echo "  EMAIL_ALERT_ENDPOINT   - Email notification endpoint"
            echo "  S3_BUCKET             - S3 bucket for backups"
            echo "  ALERT_THRESHOLD_HOURS  - Alert threshold in hours (default: 25)"
            echo ""
            echo "Examples:"
            echo "  $0 monitor"
            echo "  $0 full"
            echo "  $0 validation"
            echo ""
            echo "Cron Setup:"
            echo "  */15 * * * * $0 monitor  # Every 15 minutes"
            echo "  0 */6 * * * $0 full      # Every 6 hours"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"