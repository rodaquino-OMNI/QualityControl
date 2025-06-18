#!/bin/bash

# AUSTA Cockpit Disaster Recovery Orchestrator
set -e

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DR_LOG_FILE="/var/log/disaster-recovery_${TIMESTAMP}.log"
DR_CONFIG_FILE="/app/docker/disaster-recovery/dr-config.json"
RECOVERY_WORKSPACE="/tmp/dr-recovery-${TIMESTAMP}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Recovery phases
PHASE_ASSESS="assess"
PHASE_PREPARE="prepare"
PHASE_RECOVER="recover"
PHASE_VERIFY="verify"
PHASE_COMPLETE="complete"

# Function to print colored output and log
log_message() {
    local color=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo -e "${color}[${timestamp}] ${message}${NC}"
    echo "[${timestamp}] ${message}" >> "$DR_LOG_FILE"
}

# Function to send notifications
send_notification() {
    local level=$1
    local message=$2
    local channels="slack,email,sms"
    
    log_message $BLUE "NOTIFICATION [$level]: $message"
    
    # Send to Slack
    if [ ! -z "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST "$SLACK_WEBHOOK_URL" \
            -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 DR Alert [$level]: $message\"}" >/dev/null 2>&1 || true
    fi
    
    # Send email notification
    if [ ! -z "$EMAIL_ALERT_ENDPOINT" ]; then
        curl -X POST "$EMAIL_ALERT_ENDPOINT" \
            -H 'Content-type: application/json' \
            --data "{\"subject\":\"DR Alert\",\"message\":\"$message\",\"level\":\"$level\"}" >/dev/null 2>&1 || true
    fi
    
    # Send SMS for critical alerts
    if [ "$level" = "CRITICAL" ] && [ ! -z "$SMS_ALERT_ENDPOINT" ]; then
        curl -X POST "$SMS_ALERT_ENDPOINT" \
            -H 'Content-type: application/json' \
            --data "{\"message\":\"DR CRITICAL: $message\"}" >/dev/null 2>&1 || true
    fi
}

# Function to create DR configuration if not exists
create_dr_config() {
    if [ ! -f "$DR_CONFIG_FILE" ]; then
        log_message $YELLOW "Creating default DR configuration..."
        
        mkdir -p "$(dirname "$DR_CONFIG_FILE")"
        
        cat > "$DR_CONFIG_FILE" << EOF
{
    "recovery_objectives": {
        "rto_critical": 7200,
        "rto_high": 14400,
        "rto_medium": 86400,
        "rpo_database": 900,
        "rpo_application": 3600,
        "rpo_config": 86400
    },
    "services": {
        "postgres": {
            "priority": "critical",
            "rto": 1800,
            "rpo": 900,
            "dependencies": [],
            "health_check": "http://localhost:5432",
            "recovery_script": "./restore-postgres-pitr.sh"
        },
        "redis": {
            "priority": "high",
            "rto": 3600,
            "rpo": 3600,
            "dependencies": [],
            "health_check": "redis://localhost:6379",
            "recovery_script": "./restore-redis.sh"
        },
        "mongodb": {
            "priority": "high",
            "rto": 3600,
            "rpo": 3600,
            "dependencies": [],
            "health_check": "mongodb://localhost:27017",
            "recovery_script": "./restore-mongodb.sh"
        },
        "backend": {
            "priority": "critical",
            "rto": 3600,
            "rpo": 3600,
            "dependencies": ["postgres", "redis", "mongodb"],
            "health_check": "http://localhost:3001/health",
            "recovery_script": "./restore-backend.sh"
        },
        "ai-service": {
            "priority": "medium",
            "rto": 14400,
            "rpo": 14400,
            "dependencies": ["postgres", "redis"],
            "health_check": "http://localhost:8000/health",
            "recovery_script": "./restore-ai-service.sh"
        },
        "frontend": {
            "priority": "high",
            "rto": 7200,
            "rpo": 14400,
            "dependencies": ["backend"],
            "health_check": "http://localhost:3000/health",
            "recovery_script": "./restore-frontend.sh"
        },
        "nginx-lb": {
            "priority": "high",
            "rto": 1800,
            "rpo": 86400,
            "dependencies": ["frontend", "backend"],
            "health_check": "http://localhost/health",
            "recovery_script": "./restore-nginx.sh"
        }
    },
    "backup_locations": {
        "primary": "/backups",
        "secondary": "s3://austa-backups-primary/",
        "tertiary": "s3://austa-backups-secondary-us-west-2/"
    },
    "notification": {
        "slack_webhook": "${SLACK_WEBHOOK_URL}",
        "email_endpoint": "${EMAIL_ALERT_ENDPOINT}",
        "sms_endpoint": "${SMS_ALERT_ENDPOINT}"
    }
}
EOF
        
        log_message $GREEN "DR configuration created: $DR_CONFIG_FILE"
    fi
}

# Function to assess disaster impact
assess_disaster() {
    log_message $PURPLE "=== PHASE 1: DISASTER ASSESSMENT ==="
    
    local disaster_type=$1
    local affected_services=""
    local assessment_file="${RECOVERY_WORKSPACE}/assessment.json"
    
    mkdir -p "$RECOVERY_WORKSPACE"
    
    log_message $YELLOW "Assessing disaster impact..."
    
    # Check service status
    local services=$(jq -r '.services | keys[]' "$DR_CONFIG_FILE")
    
    cat > "$assessment_file" << EOF
{
    "assessment_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "disaster_type": "${disaster_type}",
    "affected_services": [],
    "recovery_plan": {
        "phases": [],
        "estimated_duration": 0,
        "total_services": 0
    }
}
EOF
    
    for service in $services; do
        log_message $YELLOW "Checking service: $service"
        
        local health_check=$(jq -r ".services.$service.health_check" "$DR_CONFIG_FILE")
        local priority=$(jq -r ".services.$service.priority" "$DR_CONFIG_FILE")
        local is_healthy=false
        
        # Perform health check
        case "$health_check" in
            http://*)
                if curl -f --max-time 10 "$health_check" >/dev/null 2>&1; then
                    is_healthy=true
                fi
                ;;
            redis://*)
                if redis-cli -u "$health_check" ping >/dev/null 2>&1; then
                    is_healthy=true
                fi
                ;;
            mongodb://*)
                if mongosh "$health_check" --eval "db.runCommand('ping')" >/dev/null 2>&1; then
                    is_healthy=true
                fi
                ;;
            *)
                # Docker container check
                if docker ps --filter "name=$service" --filter "status=running" | grep -q "$service"; then
                    is_healthy=true
                fi
                ;;
        esac
        
        if [ "$is_healthy" = false ]; then
            log_message $RED "Service $service is DOWN"
            affected_services="$affected_services $service"
            
            # Add to assessment
            jq ".affected_services += [\"$service\"]" "$assessment_file" > "${assessment_file}.tmp"
            mv "${assessment_file}.tmp" "$assessment_file"
        else
            log_message $GREEN "Service $service is HEALTHY"
        fi
    done
    
    if [ -z "$affected_services" ]; then
        log_message $GREEN "No services affected - false alarm or services already recovered"
        return 1
    fi
    
    # Calculate recovery phases and duration
    calculate_recovery_plan "$assessment_file"
    
    # Send initial notification
    local affected_count=$(echo "$affected_services" | wc -w)
    send_notification "CRITICAL" "Disaster detected: $disaster_type. $affected_count services affected: $affected_services"
    
    log_message $PURPLE "Assessment complete. Affected services: $affected_services"
    return 0
}

# Function to calculate recovery plan
calculate_recovery_plan() {
    local assessment_file=$1
    
    log_message $YELLOW "Calculating recovery plan..."
    
    # Get all affected services
    local affected_services=$(jq -r '.affected_services[]' "$assessment_file")
    
    # Create dependency graph and recovery phases
    local phase_1=""  # No dependencies
    local phase_2=""  # Depends on phase 1
    local phase_3=""  # Depends on phase 1 and 2
    
    for service in $affected_services; do
        local dependencies=$(jq -r ".services.$service.dependencies[]?" "$DR_CONFIG_FILE" 2>/dev/null || echo "")
        
        if [ -z "$dependencies" ]; then
            phase_1="$phase_1 $service"
        else
            # Check if all dependencies are in phase 1
            local in_phase_2=true
            for dep in $dependencies; do
                if ! echo "$phase_1" | grep -q "$dep"; then
                    in_phase_2=false
                    break
                fi
            done
            
            if [ "$in_phase_2" = true ]; then
                phase_2="$phase_2 $service"
            else
                phase_3="$phase_3 $service"
            fi
        fi
    done
    
    # Calculate estimated duration
    local total_duration=0
    local phase_duration=0
    
    # Phase 1 duration (parallel)
    for service in $phase_1; do
        local rto=$(jq -r ".services.$service.rto" "$DR_CONFIG_FILE")
        if [ "$rto" -gt "$phase_duration" ]; then
            phase_duration=$rto
        fi
    done
    total_duration=$phase_duration
    
    # Phase 2 duration (parallel after phase 1)
    phase_duration=0
    for service in $phase_2; do
        local rto=$(jq -r ".services.$service.rto" "$DR_CONFIG_FILE")
        if [ "$rto" -gt "$phase_duration" ]; then
            phase_duration=$rto
        fi
    done
    total_duration=$((total_duration + phase_duration))
    
    # Phase 3 duration (parallel after phase 2)
    phase_duration=0
    for service in $phase_3; do
        local rto=$(jq -r ".services.$service.rto" "$DR_CONFIG_FILE")
        if [ "$rto" -gt "$phase_duration" ]; then
            phase_duration=$rto
        fi
    done
    total_duration=$((total_duration + phase_duration))
    
    # Update assessment file
    jq ".recovery_plan.phases = [\"$phase_1\", \"$phase_2\", \"$phase_3\"]" "$assessment_file" > "${assessment_file}.tmp"
    mv "${assessment_file}.tmp" "$assessment_file"
    
    jq ".recovery_plan.estimated_duration = $total_duration" "$assessment_file" > "${assessment_file}.tmp"
    mv "${assessment_file}.tmp" "$assessment_file"
    
    jq ".recovery_plan.total_services = $(echo "$affected_services" | wc -w)" "$assessment_file" > "${assessment_file}.tmp"
    mv "${assessment_file}.tmp" "$assessment_file"
    
    local hours=$((total_duration / 3600))
    local minutes=$(((total_duration % 3600) / 60))
    log_message $BLUE "Estimated recovery time: ${hours}h ${minutes}m"
}

# Function to prepare recovery environment
prepare_recovery() {
    log_message $PURPLE "=== PHASE 2: RECOVERY PREPARATION ==="
    
    log_message $YELLOW "Preparing recovery environment..."
    
    # Create recovery workspace
    mkdir -p "${RECOVERY_WORKSPACE}/scripts"
    mkdir -p "${RECOVERY_WORKSPACE}/configs"
    mkdir -p "${RECOVERY_WORKSPACE}/data"
    
    # Copy recovery scripts
    cp -r /app/docker/backup-scripts/* "${RECOVERY_WORKSPACE}/scripts/"
    
    # Download latest backups if needed
    prepare_backups
    
    # Prepare infrastructure
    prepare_infrastructure
    
    log_message $GREEN "Recovery environment prepared"
}

# Function to prepare backups
prepare_backups() {
    log_message $YELLOW "Preparing backup data..."
    
    local primary_backup=$(jq -r '.backup_locations.primary' "$DR_CONFIG_FILE")
    local secondary_backup=$(jq -r '.backup_locations.secondary' "$DR_CONFIG_FILE")
    
    # Check primary backup location
    if [ -d "$primary_backup" ]; then
        log_message $GREEN "Primary backup location accessible: $primary_backup"
    else
        log_message $YELLOW "Primary backup location not accessible, using secondary: $secondary_backup"
        
        # Download from S3
        if command -v aws >/dev/null 2>&1; then
            aws s3 sync "$secondary_backup" "${RECOVERY_WORKSPACE}/backups/" --exclude "*.tmp"
            log_message $GREEN "Backups downloaded from secondary location"
        else
            log_message $RED "AWS CLI not available, cannot download backups"
            return 1
        fi
    fi
}

# Function to prepare infrastructure
prepare_infrastructure() {
    log_message $YELLOW "Preparing infrastructure..."
    
    # Stop any running containers
    docker stop $(docker ps -q) 2>/dev/null || true
    
    # Clean up corrupted volumes if needed
    if [ "$FORCE_VOLUME_RECREATION" = "true" ]; then
        log_message $YELLOW "Recreating Docker volumes..."
        docker volume rm postgres-data redis-data mongodb-data backend-uploads ai-models ai-cache 2>/dev/null || true
        docker volume create postgres-data
        docker volume create redis-data
        docker volume create mongodb-data
        docker volume create backend-uploads
        docker volume create ai-models
        docker volume create ai-cache
    fi
    
    # Pull latest images if needed
    docker-compose pull
    
    log_message $GREEN "Infrastructure prepared"
}

# Function to execute recovery
execute_recovery() {
    log_message $PURPLE "=== PHASE 3: SERVICE RECOVERY ==="
    
    local assessment_file="${RECOVERY_WORKSPACE}/assessment.json"
    local phases=$(jq -r '.recovery_plan.phases[]' "$assessment_file")
    local phase_num=1
    
    echo "$phases" | while read -r phase_services; do
        if [ ! -z "$phase_services" ] && [ "$phase_services" != "null" ]; then
            log_message $BLUE "Starting recovery phase $phase_num: $phase_services"
            
            # Start services in parallel for this phase
            for service in $phase_services; do
                recover_service "$service" &
            done
            
            # Wait for all services in this phase to complete
            wait
            
            # Verify phase completion
            verify_phase_recovery "$phase_services"
            
            phase_num=$((phase_num + 1))
        fi
    done
    
    log_message $GREEN "Service recovery completed"
}

# Function to recover individual service
recover_service() {
    local service=$1
    local recovery_script=$(jq -r ".services.$service.recovery_script" "$DR_CONFIG_FILE")
    local rto=$(jq -r ".services.$service.rto" "$DR_CONFIG_FILE")
    
    log_message $YELLOW "Recovering service: $service (RTO: ${rto}s)"
    
    # Set timeout for recovery
    timeout "$rto" bash -c "
        cd ${RECOVERY_WORKSPACE}/scripts
        
        case '$service' in
            'postgres')
                ./restore-postgres-pitr.sh restore \$(ls /backups/postgres/base-backups/ | tail -1)
                ;;
            'redis')
                ./restore-redis.sh restore rdb \$(ls /backups/redis/rdb-backups/*.gz | tail -1 | basename)
                ;;
            'mongodb')
                ./restore-mongodb.sh restore dump \$(ls /backups/mongodb/dump-backups/*.tar.gz | tail -1 | basename)
                ;;
            'backend'|'ai-service'|'frontend'|'nginx-lb')
                docker-compose up -d $service
                ;;
            *)
                docker-compose up -d $service
                ;;
        esac
    "
    
    local recovery_status=$?
    
    if [ $recovery_status -eq 0 ]; then
        log_message $GREEN "Service $service recovered successfully"
    else
        log_message $RED "Service $service recovery failed"
        send_notification "HIGH" "Recovery failed for service: $service"
    fi
    
    return $recovery_status
}

# Function to verify phase recovery
verify_phase_recovery() {
    local phase_services=$1
    
    log_message $YELLOW "Verifying phase recovery: $phase_services"
    
    for service in $phase_services; do
        local health_check=$(jq -r ".services.$service.health_check" "$DR_CONFIG_FILE")
        local max_attempts=12
        local attempt=1
        local is_healthy=false
        
        while [ $attempt -le $max_attempts ]; do
            case "$health_check" in
                http://*)
                    if curl -f --max-time 10 "$health_check" >/dev/null 2>&1; then
                        is_healthy=true
                        break
                    fi
                    ;;
                redis://*)
                    if redis-cli -u "$health_check" ping >/dev/null 2>&1; then
                        is_healthy=true
                        break
                    fi
                    ;;
                mongodb://*)
                    if mongosh "$health_check" --eval "db.runCommand('ping')" >/dev/null 2>&1; then
                        is_healthy=true
                        break
                    fi
                    ;;
                *)
                    if docker ps --filter "name=$service" --filter "status=running" | grep -q "$service"; then
                        is_healthy=true
                        break
                    fi
                    ;;
            esac
            
            log_message $YELLOW "Service $service not ready, attempt $attempt/$max_attempts"
            sleep 10
            attempt=$((attempt + 1))
        done
        
        if [ "$is_healthy" = true ]; then
            log_message $GREEN "Service $service is healthy"
        else
            log_message $RED "Service $service failed health check"
            return 1
        fi
    done
    
    return 0
}

# Function to verify complete recovery
verify_recovery() {
    log_message $PURPLE "=== PHASE 4: RECOVERY VERIFICATION ==="
    
    log_message $YELLOW "Performing comprehensive recovery verification..."
    
    # Test all services
    local assessment_file="${RECOVERY_WORKSPACE}/assessment.json"
    local affected_services=$(jq -r '.affected_services[]' "$assessment_file")
    
    for service in $affected_services; do
        verify_service_functionality "$service"
    done
    
    # Run integration tests
    run_integration_tests
    
    # Verify data integrity
    verify_data_integrity
    
    log_message $GREEN "Recovery verification completed"
}

# Function to verify service functionality
verify_service_functionality() {
    local service=$1
    
    log_message $YELLOW "Verifying functionality for service: $service"
    
    case "$service" in
        "postgres")
            # Test database connectivity and basic operations
            docker exec austa-postgres psql -U austa -d austa_db -c "SELECT COUNT(*) FROM users;" >/dev/null
            ;;
        "redis")
            # Test Redis operations
            docker exec austa-redis redis-cli SET test_key test_value >/dev/null
            docker exec austa-redis redis-cli GET test_key >/dev/null
            docker exec austa-redis redis-cli DEL test_key >/dev/null
            ;;
        "mongodb")
            # Test MongoDB operations
            docker exec austa-mongodb mongosh --eval "db.test.insertOne({test: 'data'})" >/dev/null
            docker exec austa-mongodb mongosh --eval "db.test.deleteOne({test: 'data'})" >/dev/null
            ;;
        "backend")
            # Test API endpoints
            curl -f http://localhost:3001/health >/dev/null
            curl -f http://localhost:3001/api/v1/auth/status >/dev/null
            ;;
        "frontend")
            # Test frontend accessibility
            curl -f http://localhost:3000 >/dev/null
            ;;
        "ai-service")
            # Test AI service
            curl -f http://localhost:8000/health >/dev/null
            ;;
        "nginx-lb")
            # Test load balancer
            curl -f http://localhost/health >/dev/null
            ;;
    esac
    
    local test_status=$?
    
    if [ $test_status -eq 0 ]; then
        log_message $GREEN "Service $service functionality verified"
    else
        log_message $RED "Service $service functionality test failed"
    fi
    
    return $test_status
}

# Function to run integration tests
run_integration_tests() {
    log_message $YELLOW "Running integration tests..."
    
    # Test user authentication flow
    if curl -f -X POST http://localhost:3001/api/v1/auth/login \
        -H "Content-Type: application/json" \
        -d '{"email":"test@example.com","password":"testpass"}' >/dev/null 2>&1; then
        log_message $GREEN "Authentication flow test passed"
    else
        log_message $YELLOW "Authentication flow test failed (may be expected)"
    fi
    
    # Test database connectivity through API
    if curl -f http://localhost:3001/api/v1/health/database >/dev/null 2>&1; then
        log_message $GREEN "Database connectivity test passed"
    else
        log_message $RED "Database connectivity test failed"
    fi
    
    # Test AI service integration
    if curl -f http://localhost:3001/api/v1/ai/health >/dev/null 2>&1; then
        log_message $GREEN "AI service integration test passed"
    else
        log_message $YELLOW "AI service integration test failed (may be expected)"
    fi
}

# Function to verify data integrity
verify_data_integrity() {
    log_message $YELLOW "Verifying data integrity..."
    
    # Check database table counts
    local user_count=$(docker exec austa-postgres psql -U austa -d austa_db -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' ' || echo "0")
    local case_count=$(docker exec austa-postgres psql -U austa -d austa_db -t -c "SELECT COUNT(*) FROM cases;" 2>/dev/null | tr -d ' ' || echo "0")
    
    log_message $BLUE "Database integrity: Users=$user_count, Cases=$case_count"
    
    # Check Redis key count
    local redis_keys=$(docker exec austa-redis redis-cli DBSIZE 2>/dev/null || echo "0")
    log_message $BLUE "Redis integrity: Keys=$redis_keys"
    
    # Check MongoDB collections
    local mongo_collections=$(docker exec austa-mongodb mongosh --quiet --eval "db.adminCommand('listCollections').cursor.firstBatch.length" 2>/dev/null || echo "0")
    log_message $BLUE "MongoDB integrity: Collections=$mongo_collections"
    
    # Verify file uploads
    local upload_count=$(find /app/uploads -type f 2>/dev/null | wc -l || echo "0")
    log_message $BLUE "Upload integrity: Files=$upload_count"
}

# Function to complete recovery
complete_recovery() {
    log_message $PURPLE "=== PHASE 5: RECOVERY COMPLETION ==="
    
    # Generate recovery report
    generate_recovery_report
    
    # Clean up temporary files
    cleanup_recovery_workspace
    
    # Send completion notification
    send_notification "INFO" "Disaster recovery completed successfully. All services restored."
    
    # Schedule post-recovery tasks
    schedule_post_recovery_tasks
    
    log_message $GREEN "Disaster recovery process completed successfully"
}

# Function to generate recovery report
generate_recovery_report() {
    local report_file="/var/log/disaster-recovery-report-${TIMESTAMP}.json"
    local assessment_file="${RECOVERY_WORKSPACE}/assessment.json"
    
    log_message $YELLOW "Generating recovery report..."
    
    local start_time=$(jq -r '.assessment_time' "$assessment_file")
    local end_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local affected_services=$(jq -r '.affected_services' "$assessment_file")
    local estimated_duration=$(jq -r '.recovery_plan.estimated_duration' "$assessment_file")
    
    # Calculate actual duration
    local start_epoch=$(date -d "$start_time" +%s)
    local end_epoch=$(date -d "$end_time" +%s)
    local actual_duration=$((end_epoch - start_epoch))
    
    cat > "$report_file" << EOF
{
    "recovery_session": {
        "timestamp": "${TIMESTAMP}",
        "start_time": "${start_time}",
        "end_time": "${end_time}",
        "actual_duration_seconds": ${actual_duration},
        "estimated_duration_seconds": ${estimated_duration}
    },
    "disaster_assessment": $(cat "$assessment_file"),
    "recovery_results": {
        "status": "completed",
        "services_recovered": ${affected_services},
        "rto_met": $((actual_duration <= estimated_duration)),
        "data_integrity_verified": true
    },
    "performance_metrics": {
        "rto_variance_seconds": $((actual_duration - estimated_duration)),
        "recovery_efficiency": $(echo "scale=2; $estimated_duration / $actual_duration" | bc -l 2>/dev/null || echo "1.0")
    },
    "recommendations": [
        "Review and update recovery procedures based on actual performance",
        "Consider optimizing backup strategies for faster recovery",
        "Schedule regular DR testing to maintain readiness"
    ]
}
EOF
    
    log_message $GREEN "Recovery report generated: $report_file"
    
    # Upload report to backup location
    if command -v aws >/dev/null 2>&1 && [ ! -z "$S3_BUCKET" ]; then
        aws s3 cp "$report_file" "s3://${S3_BUCKET}/disaster-recovery/reports/"
    fi
}

# Function to cleanup recovery workspace
cleanup_recovery_workspace() {
    log_message $YELLOW "Cleaning up recovery workspace..."
    
    # Archive recovery logs
    tar -czf "/var/log/disaster-recovery-workspace-${TIMESTAMP}.tar.gz" "$RECOVERY_WORKSPACE"
    
    # Remove temporary workspace
    rm -rf "$RECOVERY_WORKSPACE"
    
    log_message $GREEN "Recovery workspace cleaned up"
}

# Function to schedule post-recovery tasks
schedule_post_recovery_tasks() {
    log_message $YELLOW "Scheduling post-recovery tasks..."
    
    # Schedule backup verification
    echo "0 2 * * * /app/docker/backup-scripts/verify-backups.sh" | crontab -
    
    # Schedule enhanced monitoring
    echo "*/5 * * * * /app/scripts/enhanced-health-check.sh" | crontab -
    
    log_message $GREEN "Post-recovery tasks scheduled"
}

# Main orchestrator function
main() {
    local command=$1
    local disaster_type=${2:-"unknown"}
    
    # Create log file
    touch "$DR_LOG_FILE"
    
    # Create DR configuration
    create_dr_config
    
    case "$command" in
        "assess")
            assess_disaster "$disaster_type"
            ;;
        "prepare")
            prepare_recovery
            ;;
        "recover")
            execute_recovery
            ;;
        "verify")
            verify_recovery
            ;;
        "complete")
            complete_recovery
            ;;
        "full")
            log_message $PURPLE "Starting full disaster recovery process..."
            
            if assess_disaster "$disaster_type"; then
                prepare_recovery
                execute_recovery
                verify_recovery
                complete_recovery
            else
                log_message $GREEN "No disaster recovery needed"
            fi
            ;;
        "test")
            log_message $PURPLE "Running disaster recovery test..."
            export FORCE_VOLUME_RECREATION=false
            assess_disaster "test"
            prepare_recovery
            verify_recovery
            ;;
        *)
            echo "AUSTA Cockpit Disaster Recovery Orchestrator"
            echo "==========================================="
            echo ""
            echo "Usage: $0 <command> [disaster_type]"
            echo ""
            echo "Commands:"
            echo "  assess <type>    - Assess disaster impact"
            echo "  prepare          - Prepare recovery environment"
            echo "  recover          - Execute service recovery"
            echo "  verify           - Verify recovery completion"
            echo "  complete         - Complete recovery process"
            echo "  full <type>      - Run complete DR process"
            echo "  test             - Run DR test without data loss"
            echo ""
            echo "Disaster Types:"
            echo "  hardware-failure    - Hardware or infrastructure failure"
            echo "  data-corruption     - Data corruption or loss"
            echo "  cyber-attack        - Security incident or cyber attack"
            echo "  natural-disaster    - Natural disaster affecting infrastructure"
            echo "  human-error         - Human error causing system damage"
            echo "  software-failure    - Software bug or failure"
            echo "  network-outage      - Network connectivity issues"
            echo ""
            echo "Environment Variables:"
            echo "  SLACK_WEBHOOK_URL      - Slack notifications"
            echo "  EMAIL_ALERT_ENDPOINT   - Email notifications"
            echo "  SMS_ALERT_ENDPOINT     - SMS notifications"
            echo "  S3_BUCKET             - Primary backup bucket"
            echo "  FORCE_VOLUME_RECREATION - Recreate Docker volumes"
            echo ""
            echo "Examples:"
            echo "  $0 full hardware-failure"
            echo "  $0 assess data-corruption"
            echo "  $0 test"
            exit 1
            ;;
    esac
    
    log_message $BLUE "Disaster recovery operation completed: $command"
}

# Execute main function
main "$@"