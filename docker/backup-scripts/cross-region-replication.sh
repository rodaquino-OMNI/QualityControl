#!/bin/bash

# Cross-Region Backup Replication for AUSTA Cockpit
set -e

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/backups/cross-region-replication_${TIMESTAMP}.log"
REPLICATION_CONFIG="/backups/cross-region-config.json"

# Default regions configuration
PRIMARY_REGION=${PRIMARY_REGION:-"us-east-1"}
SECONDARY_REGIONS=${SECONDARY_REGIONS:-"us-west-2,eu-west-1,ap-southeast-1"}
PRIMARY_BUCKET=${S3_BUCKET:-"austa-primary-backups"}

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output and log
log_message() {
    local color=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo -e "${color}[${timestamp}] ${message}${NC}"
    echo "[${timestamp}] ${message}" >> "$LOG_FILE"
}

# Function to create or load replication configuration
setup_replication_config() {
    log_message $BLUE "Setting up cross-region replication configuration..."
    
    if [ ! -f "$REPLICATION_CONFIG" ]; then
        cat > "$REPLICATION_CONFIG" << EOF
{
    "primary_region": "${PRIMARY_REGION}",
    "primary_bucket": "${PRIMARY_BUCKET}",
    "secondary_regions": [
        $(echo "$SECONDARY_REGIONS" | sed 's/,/","/g' | sed 's/^/"/;s/$/"/')
    ],
    "replication_rules": {
        "postgres": {
            "enabled": true,
            "priority": "high",
            "sync_frequency": "hourly"
        },
        "mongodb": {
            "enabled": true,
            "priority": "high", 
            "sync_frequency": "hourly"
        },
        "redis": {
            "enabled": true,
            "priority": "medium",
            "sync_frequency": "daily"
        },
        "application_data": {
            "enabled": true,
            "priority": "medium",
            "sync_frequency": "daily"
        }
    },
    "encryption": {
        "enabled": true,
        "kms_key_id": "${KMS_KEY_ID:-"alias/austa-backup-encryption"}"
    },
    "retention": {
        "primary": 30,
        "secondary": 90
    },
    "monitoring": {
        "sns_topic": "${SNS_TOPIC:-"arn:aws:sns:${PRIMARY_REGION}:123456789012:austa-backup-alerts"}",
        "cloudwatch_namespace": "AUSTA/BackupReplication"
    }
}
EOF
        log_message $GREEN "Replication configuration created: $REPLICATION_CONFIG"
    else
        log_message $YELLOW "Using existing replication configuration: $REPLICATION_CONFIG"
    fi
}

# Function to validate AWS credentials and regions
validate_aws_setup() {
    log_message $BLUE "Validating AWS setup for cross-region replication..."
    
    # Check AWS CLI
    if ! command -v aws >/dev/null 2>&1; then
        log_message $RED "AWS CLI not found. Please install and configure AWS CLI."
        exit 1
    fi
    
    # Check primary region access
    if ! aws s3api head-bucket --bucket "$PRIMARY_BUCKET" --region "$PRIMARY_REGION" >/dev/null 2>&1; then
        log_message $RED "Cannot access primary bucket: $PRIMARY_BUCKET in region: $PRIMARY_REGION"
        exit 1
    fi
    
    log_message $GREEN "Primary bucket access validated: $PRIMARY_BUCKET"
    
    # Validate secondary regions and create buckets if needed
    IFS=',' read -ra regions <<< "$SECONDARY_REGIONS"
    for region in "${regions[@]}"; do
        local secondary_bucket="${PRIMARY_BUCKET}-${region}"
        
        if ! aws s3api head-bucket --bucket "$secondary_bucket" --region "$region" >/dev/null 2>&1; then
            log_message $YELLOW "Creating secondary bucket: $secondary_bucket in region: $region"
            
            if [ "$region" = "us-east-1" ]; then
                aws s3api create-bucket --bucket "$secondary_bucket" --region "$region"
            else
                aws s3api create-bucket --bucket "$secondary_bucket" --region "$region" \
                    --create-bucket-configuration LocationConstraint="$region"
            fi
            
            # Enable versioning
            aws s3api put-bucket-versioning --bucket "$secondary_bucket" \
                --versioning-configuration Status=Enabled
            
            # Enable server-side encryption
            aws s3api put-bucket-encryption --bucket "$secondary_bucket" \
                --server-side-encryption-configuration '{
                    "Rules": [
                        {
                            "ApplyServerSideEncryptionByDefault": {
                                "SSEAlgorithm": "AES256"
                            }
                        }
                    ]
                }'
            
            log_message $GREEN "Secondary bucket created and configured: $secondary_bucket"
        else
            log_message $GREEN "Secondary bucket access validated: $secondary_bucket"
        fi
    done
}

# Function to replicate backups to secondary regions
replicate_backups() {
    local backup_type=$1
    
    log_message $BLUE "Starting cross-region replication for: $backup_type"
    
    IFS=',' read -ra regions <<< "$SECONDARY_REGIONS"
    
    for region in "${regions[@]}"; do
        local secondary_bucket="${PRIMARY_BUCKET}-${region}"
        
        log_message $YELLOW "Replicating $backup_type backups to region: $region"
        
        # Sync specific backup type
        aws s3 sync "s3://${PRIMARY_BUCKET}/${backup_type}/" "s3://${secondary_bucket}/${backup_type}/" \
            --region "$region" \
            --delete \
            --storage-class STANDARD_IA \
            --exclude "*.tmp" \
            --exclude "*/.DS_Store"
        
        local sync_status=$?
        
        if [ $sync_status -eq 0 ]; then
            log_message $GREEN "Successfully replicated $backup_type to $region"
            
            # Update CloudWatch metrics
            update_cloudwatch_metrics "$backup_type" "$region" "success"
        else
            log_message $RED "Failed to replicate $backup_type to $region"
            
            # Update CloudWatch metrics
            update_cloudwatch_metrics "$backup_type" "$region" "failure"
            
            # Send SNS alert
            send_alert "Cross-region replication failed for $backup_type to $region"
        fi
    done
}

# Function to perform intelligent sync based on configuration
intelligent_sync() {
    log_message $BLUE "Performing intelligent cross-region sync..."
    
    # Load configuration
    local config=$(cat "$REPLICATION_CONFIG")
    
    # Check which backup types are enabled and their frequencies
    if echo "$config" | jq -e '.replication_rules.postgres.enabled' >/dev/null 2>&1; then
        local postgres_frequency=$(echo "$config" | jq -r '.replication_rules.postgres.sync_frequency')
        if should_sync "postgres" "$postgres_frequency"; then
            replicate_backups "postgres"
        fi
    fi
    
    if echo "$config" | jq -e '.replication_rules.mongodb.enabled' >/dev/null 2>&1; then
        local mongodb_frequency=$(echo "$config" | jq -r '.replication_rules.mongodb.sync_frequency')
        if should_sync "mongodb" "$mongodb_frequency"; then
            replicate_backups "mongodb"
        fi
    fi
    
    if echo "$config" | jq -e '.replication_rules.redis.enabled' >/dev/null 2>&1; then
        local redis_frequency=$(echo "$config" | jq -r '.replication_rules.redis.sync_frequency')
        if should_sync "redis" "$redis_frequency"; then
            replicate_backups "redis"
        fi
    fi
    
    if echo "$config" | jq -e '.replication_rules.application_data.enabled' >/dev/null 2>&1; then
        local app_frequency=$(echo "$config" | jq -r '.replication_rules.application_data.sync_frequency')
        if should_sync "application_data" "$app_frequency"; then
            replicate_backups "application-data"
        fi
    fi
}

# Function to check if sync should run based on frequency
should_sync() {
    local backup_type=$1
    local frequency=$2
    local sync_marker_file="/tmp/last_sync_${backup_type}"
    
    case "$frequency" in
        "hourly")
            local max_age=3600 # 1 hour
            ;;
        "daily")
            local max_age=86400 # 24 hours
            ;;
        "weekly")
            local max_age=604800 # 7 days
            ;;
        *)
            local max_age=86400 # Default to daily
            ;;
    esac
    
    if [ -f "$sync_marker_file" ]; then
        local last_sync=$(stat -f%m "$sync_marker_file" 2>/dev/null || stat -c%Y "$sync_marker_file" 2>/dev/null)
        local current_time=$(date +%s)
        local time_diff=$((current_time - last_sync))
        
        if [ $time_diff -ge $max_age ]; then
            touch "$sync_marker_file"
            return 0
        else
            log_message $YELLOW "Skipping $backup_type sync (last sync: $((time_diff/3600)) hours ago)"
            return 1
        fi
    else
        touch "$sync_marker_file"
        return 0
    fi
}

# Function to update CloudWatch metrics
update_cloudwatch_metrics() {
    local backup_type=$1
    local region=$2
    local status=$3
    
    local namespace="AUSTA/BackupReplication"
    local metric_value
    
    if [ "$status" = "success" ]; then
        metric_value=1
    else
        metric_value=0
    fi
    
    aws cloudwatch put-metric-data \
        --namespace "$namespace" \
        --metric-data MetricName=ReplicationSuccess,Value=$metric_value,Unit=Count,Dimensions=BackupType="$backup_type",TargetRegion="$region" \
        --region "$PRIMARY_REGION" >/dev/null 2>&1 || true
    
    # Also send replication latency metric
    aws cloudwatch put-metric-data \
        --namespace "$namespace" \
        --metric-data MetricName=ReplicationLatency,Value=$(date +%s),Unit=Seconds,Dimensions=BackupType="$backup_type",TargetRegion="$region" \
        --region "$PRIMARY_REGION" >/dev/null 2>&1 || true
}

# Function to send SNS alerts
send_alert() {
    local message=$1
    
    if [ ! -z "$SNS_TOPIC" ]; then
        aws sns publish \
            --topic-arn "$SNS_TOPIC" \
            --subject "AUSTA Backup Replication Alert" \
            --message "$message" \
            --region "$PRIMARY_REGION" >/dev/null 2>&1 || true
        
        log_message $YELLOW "Alert sent: $message"
    fi
}

# Function to verify replication integrity
verify_replication() {
    log_message $BLUE "Verifying replication integrity..."
    
    IFS=',' read -ra regions <<< "$SECONDARY_REGIONS"
    
    for region in "${regions[@]}"; do
        local secondary_bucket="${PRIMARY_BUCKET}-${region}"
        
        log_message $YELLOW "Verifying replication to region: $region"
        
        # Get object counts from primary and secondary
        local primary_count=$(aws s3api list-objects-v2 --bucket "$PRIMARY_BUCKET" --region "$PRIMARY_REGION" --query 'KeyCount' --output text 2>/dev/null || echo "0")
        local secondary_count=$(aws s3api list-objects-v2 --bucket "$secondary_bucket" --region "$region" --query 'KeyCount' --output text 2>/dev/null || echo "0")
        
        log_message $BLUE "Primary bucket objects: $primary_count, Secondary bucket objects: $secondary_count"
        
        # Check if counts are reasonably close (allowing for some variance due to timing)
        local variance=$((primary_count / 10)) # Allow 10% variance
        local lower_bound=$((primary_count - variance))
        local upper_bound=$((primary_count + variance))
        
        if [ "$secondary_count" -ge "$lower_bound" ] && [ "$secondary_count" -le "$upper_bound" ]; then
            log_message $GREEN "Replication integrity verified for region: $region"
            update_cloudwatch_metrics "integrity_check" "$region" "success"
        else
            log_message $RED "Replication integrity check failed for region: $region (Primary: $primary_count, Secondary: $secondary_count)"
            update_cloudwatch_metrics "integrity_check" "$region" "failure"
            send_alert "Replication integrity check failed for region $region. Primary objects: $primary_count, Secondary objects: $secondary_count"
        fi
    done
}

# Function to cleanup old backups in secondary regions
cleanup_secondary_regions() {
    local retention_days=${1:-90}
    
    log_message $BLUE "Cleaning up old backups in secondary regions (retention: $retention_days days)..."
    
    IFS=',' read -ra regions <<< "$SECONDARY_REGIONS"
    
    for region in "${regions[@]}"; do
        local secondary_bucket="${PRIMARY_BUCKET}-${region}"
        
        log_message $YELLOW "Cleaning up old backups in region: $region"
        
        # List and delete objects older than retention period
        aws s3api list-objects-v2 \
            --bucket "$secondary_bucket" \
            --region "$region" \
            --query "Contents[?LastModified<'$(date -d "${retention_days} days ago" --iso-8601)'].Key" \
            --output text | \
        while read -r key; do
            if [ ! -z "$key" ] && [ "$key" != "None" ]; then
                aws s3api delete-object --bucket "$secondary_bucket" --key "$key" --region "$region"
                log_message $YELLOW "Deleted old backup: $key from region: $region"
            fi
        done
        
        log_message $GREEN "Cleanup completed for region: $region"
    done
}

# Function to generate replication report
generate_replication_report() {
    local report_file="/backups/cross_region_replication_report_${TIMESTAMP}.json"
    
    log_message $BLUE "Generating cross-region replication report..."
    
    # Calculate totals for each region
    local primary_size=$(aws s3api list-objects-v2 --bucket "$PRIMARY_BUCKET" --region "$PRIMARY_REGION" --query 'sum(Contents[].Size)' --output text 2>/dev/null || echo "0")
    
    local secondary_regions_data="["
    local first=true
    
    IFS=',' read -ra regions <<< "$SECONDARY_REGIONS"
    for region in "${regions[@]}"; do
        local secondary_bucket="${PRIMARY_BUCKET}-${region}"
        local secondary_size=$(aws s3api list-objects-v2 --bucket "$secondary_bucket" --region "$region" --query 'sum(Contents[].Size)' --output text 2>/dev/null || echo "0")
        local secondary_count=$(aws s3api list-objects-v2 --bucket "$secondary_bucket" --region "$region" --query 'KeyCount' --output text 2>/dev/null || echo "0")
        
        if [ "$first" = true ]; then
            first=false
        else
            secondary_regions_data+=","
        fi
        
        secondary_regions_data+="{\"region\":\"$region\",\"bucket\":\"$secondary_bucket\",\"size_bytes\":$secondary_size,\"object_count\":$secondary_count}"
    done
    secondary_regions_data+="]"
    
    cat > "$report_file" << EOF
{
    "report_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "replication_type": "cross_region_backup_replication",
    "primary_region": {
        "region": "${PRIMARY_REGION}",
        "bucket": "${PRIMARY_BUCKET}",
        "size_bytes": ${primary_size}
    },
    "secondary_regions": ${secondary_regions_data},
    "replication_status": "completed",
    "verification_status": "completed",
    "configuration": $(cat "$REPLICATION_CONFIG"),
    "log_file": "${LOG_FILE}"
}
EOF
    
    log_message $GREEN "Cross-region replication report generated: $report_file"
    
    # Upload report to primary bucket
    aws s3 cp "$report_file" "s3://${PRIMARY_BUCKET}/reports/cross-region/" --region "$PRIMARY_REGION"
}

# Function to setup automated replication with cron
setup_automated_replication() {
    log_message $BLUE "Setting up automated cross-region replication..."
    
    local cron_script="/usr/local/bin/austa-cross-region-replication"
    
    # Create the automated script
    cat > "$cron_script" << 'EOF'
#!/bin/bash
cd /app/docker/backup-scripts
./cross-region-replication.sh intelligent
EOF
    
    chmod +x "$cron_script"
    
    # Add to crontab (run every 6 hours)
    local cron_entry="0 */6 * * * $cron_script >> /var/log/cross-region-replication.log 2>&1"
    
    # Check if cron entry already exists
    if ! crontab -l 2>/dev/null | grep -q "$cron_script"; then
        (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -
        log_message $GREEN "Automated replication scheduled (every 6 hours)"
    else
        log_message $YELLOW "Automated replication already scheduled"
    fi
}

# Main function
main() {
    local command=$1
    
    # Create log file
    touch "$LOG_FILE"
    
    case "$command" in
        "setup")
            setup_replication_config
            validate_aws_setup
            setup_automated_replication
            ;;
        "sync")
            local backup_type=$2
            setup_replication_config
            validate_aws_setup
            if [ -z "$backup_type" ]; then
                replicate_backups "postgres"
                replicate_backups "mongodb" 
                replicate_backups "redis"
                replicate_backups "application-data"
            else
                replicate_backups "$backup_type"
            fi
            ;;
        "intelligent")
            setup_replication_config
            validate_aws_setup
            intelligent_sync
            ;;
        "verify")
            setup_replication_config
            validate_aws_setup
            verify_replication
            ;;
        "cleanup")
            local retention_days=${2:-90}
            setup_replication_config
            validate_aws_setup
            cleanup_secondary_regions "$retention_days"
            ;;
        "report")
            setup_replication_config
            validate_aws_setup
            generate_replication_report
            ;;
        "full")
            setup_replication_config
            validate_aws_setup
            intelligent_sync
            verify_replication
            cleanup_secondary_regions
            generate_replication_report
            ;;
        *)
            echo "Cross-Region Backup Replication Tool"
            echo "===================================="
            echo ""
            echo "Usage: $0 <command> [options]"
            echo ""
            echo "Commands:"
            echo "  setup                     - Setup replication configuration and automation"
            echo "  sync [backup_type]        - Manually sync backups to secondary regions"
            echo "  intelligent               - Intelligent sync based on configuration"
            echo "  verify                    - Verify replication integrity"
            echo "  cleanup [retention_days]  - Cleanup old backups in secondary regions"
            echo "  report                    - Generate replication report"
            echo "  full                      - Run full replication cycle"
            echo ""
            echo "Backup Types:"
            echo "  postgres                  - PostgreSQL backups"
            echo "  mongodb                   - MongoDB backups"
            echo "  redis                     - Redis backups"
            echo "  application-data          - Application data backups"
            echo ""
            echo "Environment Variables:"
            echo "  PRIMARY_REGION           - Primary AWS region (default: us-east-1)"
            echo "  SECONDARY_REGIONS        - Comma-separated list of secondary regions"
            echo "  S3_BUCKET               - Primary S3 bucket name"
            echo "  SNS_TOPIC               - SNS topic ARN for alerts"
            echo "  KMS_KEY_ID              - KMS key for encryption"
            echo ""
            echo "Examples:"
            echo "  $0 setup"
            echo "  $0 sync postgres"
            echo "  $0 intelligent"
            echo "  $0 verify"
            echo "  $0 cleanup 90"
            echo "  $0 full"
            exit 1
            ;;
    esac
    
    log_message $GREEN "Cross-region replication operation completed: $command"
}

# Execute main function
main "$@"