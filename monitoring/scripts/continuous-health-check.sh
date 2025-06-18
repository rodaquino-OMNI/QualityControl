#!/bin/bash

# Continuous Health Monitoring Script for AUSTA Cockpit
# This script performs comprehensive health checks and integrates with alerting systems

set -euo pipefail

# Configuration
CONSUL_URL="${CONSUL_URL:-http://consul:8500}"
CHECK_INTERVAL="${CHECK_INTERVAL:-60}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"
LOG_FILE="${LOG_FILE:-/var/log/health-monitor.log}"
METRICS_FILE="${METRICS_FILE:-/tmp/health-metrics.json}"

# Service endpoints
declare -A SERVICES=(
    ["ai-service"]="http://ai-service:8000"
    ["backend-service"]="http://backend-service:3000"
    ["frontend-service"]="http://frontend-service:80"
    ["postgres"]="postgres:5432"
    ["redis"]="redis:6379"
)

# Health check thresholds
RESPONSE_TIME_WARNING=2000  # 2 seconds
RESPONSE_TIME_CRITICAL=5000 # 5 seconds
FAILURE_THRESHOLD=3
RECOVERY_THRESHOLD=2

# Global state
declare -A service_failure_count
declare -A service_last_status
declare -A service_response_times

# Logging function
log() {
    local level=$1
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}

# Send alert function
send_alert() {
    local severity=$1
    local service=$2
    local message=$3
    local details=$4
    
    log "ALERT" "[$severity] $service: $message"
    
    if [[ -n "$ALERT_WEBHOOK" ]]; then
        local payload=$(cat <<EOF
{
    "severity": "$severity",
    "service": "$service",
    "message": "$message",
    "details": $details,
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "source": "health-monitor"
}
EOF
        )
        
        curl -s -X POST -H "Content-Type: application/json" \
             -d "$payload" "$ALERT_WEBHOOK" || log "ERROR" "Failed to send alert"
    fi
}

# Check HTTP endpoint
check_http_endpoint() {
    local service=$1
    local url=$2
    local endpoint=$3
    local timeout=${4:-10}
    
    local start_time=$(date +%s%3N)
    local response_code=0
    local response_time=0
    local status="unknown"
    local error=""
    
    if response=$(curl -s -w "%{http_code}" -m "$timeout" "${url}${endpoint}" 2>/dev/null); then
        response_code="${response: -3}"
        response_time=$(($(date +%s%3N) - start_time))
        
        if [[ "$response_code" -eq 200 ]]; then
            if [[ $response_time -gt $RESPONSE_TIME_CRITICAL ]]; then
                status="critical"
            elif [[ $response_time -gt $RESPONSE_TIME_WARNING ]]; then
                status="warning"
            else
                status="healthy"
            fi
        else
            status="unhealthy"
            error="HTTP $response_code"
        fi
    else
        response_time=$(($(date +%s%3N) - start_time))
        status="unhealthy"
        error="Connection failed"
    fi
    
    service_response_times["$service"]=$response_time
    
    echo "$status|$response_code|$response_time|$error"
}

# Check TCP endpoint
check_tcp_endpoint() {
    local service=$1
    local host_port=$2
    local timeout=${3:-5}
    
    local start_time=$(date +%s%3N)
    local status="unknown"
    local error=""
    
    if timeout "$timeout" bash -c "echo >/dev/tcp/${host_port//:/ }" 2>/dev/null; then
        status="healthy"
    else
        status="unhealthy"
        error="TCP connection failed"
    fi
    
    local response_time=$(($(date +%s%3N) - start_time))
    service_response_times["$service"]=$response_time
    
    echo "$status|0|$response_time|$error"
}

# Check service health
check_service_health() {
    local service=$1
    local base_url=${SERVICES[$service]}
    local check_result=""
    
    case "$service" in
        "ai-service")
            check_result=$(check_http_endpoint "$service" "$base_url" "/health/detailed" 15)
            ;;
        "backend-service")
            check_result=$(check_http_endpoint "$service" "$base_url" "/health/detailed" 10)
            ;;
        "frontend-service")
            check_result=$(check_http_endpoint "$service" "$base_url" "/health" 5)
            ;;
        "postgres")
            check_result=$(check_tcp_endpoint "$service" "$base_url" 5)
            ;;
        "redis")
            check_result=$(check_tcp_endpoint "$service" "$base_url" 3)
            ;;
        *)
            check_result="unknown|0|0|Unknown service"
            ;;
    esac
    
    echo "$check_result"
}

# Process service status
process_service_status() {
    local service=$1
    local status=$2
    local response_code=$3
    local response_time=$4
    local error=$5
    
    local last_status=${service_last_status[$service]:-"unknown"}
    local failure_count=${service_failure_count[$service]:-0}
    
    case "$status" in
        "healthy")
            if [[ "$last_status" != "healthy" && $failure_count -ge $RECOVERY_THRESHOLD ]]; then
                send_alert "info" "$service" "Service recovered" \
                    "{\"response_time\": $response_time, \"previous_status\": \"$last_status\"}"
            fi
            service_failure_count[$service]=0
            ;;
        "warning")
            if [[ "$last_status" == "healthy" ]]; then
                send_alert "warning" "$service" "Service performance degraded" \
                    "{\"response_time\": $response_time, \"threshold\": $RESPONSE_TIME_WARNING}"
            fi
            ;;
        "critical"|"unhealthy")
            ((failure_count++))
            service_failure_count[$service]=$failure_count
            
            if [[ $failure_count -ge $FAILURE_THRESHOLD ]]; then
                local severity="critical"
                [[ "$status" == "critical" ]] && severity="warning"
                
                send_alert "$severity" "$service" "Service health check failed" \
                    "{\"response_time\": $response_time, \"response_code\": $response_code, \"error\": \"$error\", \"failure_count\": $failure_count}"
            fi
            ;;
    esac
    
    service_last_status[$service]=$status
}

# Update Consul health status
update_consul_health() {
    local service=$1
    local status=$2
    local response_time=$3
    
    local consul_status="passing"
    case "$status" in
        "unhealthy"|"critical")
            consul_status="critical"
            ;;
        "warning")
            consul_status="warning"
            ;;
    esac
    
    # Update Consul health check
    local consul_payload=$(cat <<EOF
{
    "Status": "$consul_status",
    "Output": "Health check: $status (${response_time}ms)",
    "ServiceID": "$service"
}
EOF
    )
    
    curl -s -X PUT -H "Content-Type: application/json" \
         -d "$consul_payload" \
         "$CONSUL_URL/v1/agent/check/update/health-$service" || \
         log "WARN" "Failed to update Consul health for $service"
}

# Generate metrics
generate_metrics() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local metrics="{\"timestamp\": \"$timestamp\", \"services\": {"
    
    local first=true
    for service in "${!SERVICES[@]}"; do
        [[ $first == false ]] && metrics="$metrics,"
        first=false
        
        local status=${service_last_status[$service]:-"unknown"}
        local response_time=${service_response_times[$service]:-0}
        local failure_count=${service_failure_count[$service]:-0}
        
        metrics="$metrics\"$service\": {"
        metrics="$metrics\"status\": \"$status\","
        metrics="$metrics\"response_time_ms\": $response_time,"
        metrics="$metrics\"failure_count\": $failure_count"
        metrics="$metrics}"
    done
    
    metrics="$metrics}}"
    echo "$metrics" > "$METRICS_FILE"
}

# Check overall system health
check_system_health() {
    local healthy_services=0
    local total_services=${#SERVICES[@]}
    local critical_services=()
    
    for service in "${!SERVICES[@]}"; do
        local status=${service_last_status[$service]:-"unknown"}
        case "$status" in
            "healthy"|"warning")
                ((healthy_services++))
                ;;
            "critical"|"unhealthy")
                critical_services+=("$service")
                ;;
        esac
    done
    
    local health_percentage=$((healthy_services * 100 / total_services))
    
    if [[ $health_percentage -lt 50 ]]; then
        send_alert "critical" "system" "System health critical" \
            "{\"healthy_services\": $healthy_services, \"total_services\": $total_services, \"critical_services\": [$(printf '\"%s\",' "${critical_services[@]}" | sed 's/,$//')]}"
    elif [[ $health_percentage -lt 80 ]]; then
        send_alert "warning" "system" "System health degraded" \
            "{\"healthy_services\": $healthy_services, \"total_services\": $total_services, \"health_percentage\": $health_percentage}"
    fi
}

# Main monitoring loop
main() {
    log "INFO" "Starting continuous health monitoring"
    log "INFO" "Check interval: ${CHECK_INTERVAL}s"
    log "INFO" "Monitoring services: ${!SERVICES[*]}"
    
    while true; do
        log "DEBUG" "Starting health check cycle"
        
        # Check each service
        for service in "${!SERVICES[@]}"; do
            log "DEBUG" "Checking $service"
            
            local result=$(check_service_health "$service")
            IFS='|' read -r status response_code response_time error <<< "$result"
            
            log "DEBUG" "$service: $status (${response_time}ms) - $error"
            
            process_service_status "$service" "$status" "$response_code" "$response_time" "$error"
            update_consul_health "$service" "$status" "$response_time"
        done
        
        # Check overall system health
        check_system_health
        
        # Generate metrics
        generate_metrics
        
        log "DEBUG" "Health check cycle completed"
        sleep "$CHECK_INTERVAL"
    done
}

# Signal handlers
cleanup() {
    log "INFO" "Shutting down health monitor"
    exit 0
}

trap cleanup SIGTERM SIGINT

# Initialize
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$(dirname "$METRICS_FILE")"

# Start monitoring
main