#!/bin/bash
# AUSTA Cockpit Service Health Checker
# Comprehensive health checks for all application services

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../../" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Global variables
ENVIRONMENT=""
TIMEOUT=30
RETRIES=3
VERBOSE=false
DETAILED=false

# Health check results
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Logging functions
log_info() {
    echo -e "${BLUE}[HEALTH]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED_CHECKS++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNING_CHECKS++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED_CHECKS++))
}

log_step() {
    echo -e "${PURPLE}[CHECK]${NC} $1"
    ((TOTAL_CHECKS++))
}

# Help function
show_help() {
    cat << EOF
AUSTA Cockpit Service Health Checker

Usage: $0 <environment> [options]

Arguments:
    environment                     Target environment (development|staging|production)

Options:
    -t, --timeout <seconds>         Health check timeout (default: 30)
    -r, --retries <count>           Number of retries for failed checks (default: 3)
    -v, --verbose                   Enable verbose output
    -d, --detailed                  Show detailed health information
    -h, --help                      Show this help message

Health Checks:
    - Kubernetes cluster connectivity
    - Pod status and readiness
    - Service endpoints accessibility
    - Database connectivity
    - External dependencies
    - SSL certificates
    - Load balancer health
    - Storage systems

Examples:
    $0 production
    $0 staging --timeout 60 --retries 5 --detailed
    $0 development --verbose
EOF
}

# Parse command line arguments
parse_args() {
    if [[ $# -eq 0 ]]; then
        show_help
        exit 1
    fi
    
    ENVIRONMENT="$1"
    shift
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -t|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            -r|--retries)
                RETRIES="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -d|--detailed)
                DETAILED=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Validate arguments
validate_args() {
    if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT"
        exit 1
    fi
}

# Check if kubectl is configured
check_kubectl() {
    log_step "Checking Kubernetes connectivity"
    
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found"
        return 1
    fi
    
    if kubectl cluster-info &> /dev/null; then
        local cluster_info
        cluster_info=$(kubectl cluster-info 2>/dev/null | head -1)
        log_success "Kubernetes cluster accessible: $cluster_info"
        return 0
    else
        log_error "Cannot connect to Kubernetes cluster"
        return 1
    fi
}

# Check namespace exists
check_namespace() {
    log_step "Checking application namespace"
    
    local namespace="austa-cockpit-${ENVIRONMENT}"
    
    if kubectl get namespace "$namespace" &> /dev/null; then
        log_success "Namespace '$namespace' exists"
        return 0
    else
        log_error "Namespace '$namespace' not found"
        return 1
    fi
}

# Check pod status
check_pods() {
    log_step "Checking pod status"
    
    local namespace="austa-cockpit-${ENVIRONMENT}"
    local all_pods_ready=true
    
    # Get all pods in namespace
    local pods
    if ! pods=$(kubectl get pods -n "$namespace" --no-headers 2>/dev/null); then
        log_error "Cannot get pods in namespace $namespace"
        return 1
    fi
    
    if [[ -z "$pods" ]]; then
        log_warning "No pods found in namespace $namespace"
        return 1
    fi
    
    # Check each pod
    while read -r line; do
        if [[ -z "$line" ]]; then
            continue
        fi
        
        local pod_name status ready restarts age
        read -r pod_name ready status restarts age <<< "$line"
        
        if [[ "$VERBOSE" == "true" ]]; then
            log_info "Pod: $pod_name | Ready: $ready | Status: $status | Restarts: $restarts"
        fi
        
        if [[ "$status" != "Running" ]]; then
            log_error "Pod $pod_name is not running (Status: $status)"
            all_pods_ready=false
        elif [[ "$ready" != *"/"* ]] || [[ "${ready%/*}" != "${ready#*/}" ]]; then
            # Check if all containers in pod are ready
            local ready_count total_count
            ready_count="${ready%/*}"
            total_count="${ready#*/}"
            
            if [[ "$ready_count" != "$total_count" ]]; then
                log_warning "Pod $pod_name not fully ready ($ready)"
                all_pods_ready=false
            fi
        fi
        
        # Check restart count
        if [[ "$restarts" -gt 5 ]]; then
            log_warning "Pod $pod_name has high restart count: $restarts"
        fi
        
    done <<< "$pods"
    
    if [[ "$all_pods_ready" == "true" ]]; then
        log_success "All pods are running and ready"
        return 0
    else
        log_error "Some pods are not healthy"
        return 1
    fi
}

# Check service endpoints
check_services() {
    log_step "Checking service endpoints"
    
    local namespace="austa-cockpit-${ENVIRONMENT}"
    local services=(
        "austa-cockpit-frontend:3000"
        "austa-cockpit-backend:8080"
        "austa-cockpit-ai-service:8000"
    )
    
    local all_services_healthy=true
    
    for service_port in "${services[@]}"; do
        local service_name port
        service_name="${service_port%:*}"
        port="${service_port#*:}"
        
        # Check if service exists
        if ! kubectl get service "$service_name" -n "$namespace" &> /dev/null; then
            log_error "Service $service_name not found"
            all_services_healthy=false
            continue
        fi
        
        # Get service cluster IP
        local cluster_ip
        cluster_ip=$(kubectl get service "$service_name" -n "$namespace" -o jsonpath='{.spec.clusterIP}')
        
        if [[ -z "$cluster_ip" || "$cluster_ip" == "None" ]]; then
            log_error "Service $service_name has no cluster IP"
            all_services_healthy=false
            continue
        fi
        
        # Test service connectivity
        if check_endpoint_health "http://${cluster_ip}:${port}/health"; then
            log_success "Service $service_name is healthy"
        else
            log_error "Service $service_name health check failed"
            all_services_healthy=false
        fi
    done
    
    if [[ "$all_services_healthy" == "true" ]]; then
        return 0
    else
        return 1
    fi
}

# Check endpoint health
check_endpoint_health() {
    local endpoint="$1"
    local retry_count=0
    
    while [[ $retry_count -lt $RETRIES ]]; do
        if kubectl run health-check-temp --image=curlimages/curl --rm -i --restart=Never \
            --timeout="${TIMEOUT}s" \
            -- curl -sf --max-time "$TIMEOUT" "$endpoint" &> /dev/null; then
            return 0
        fi
        
        ((retry_count++))
        if [[ $retry_count -lt $RETRIES ]]; then
            sleep 2
        fi
    done
    
    return 1
}

# Check database connectivity
check_databases() {
    log_step "Checking database connectivity"
    
    local namespace="austa-cockpit-${ENVIRONMENT}"
    local all_databases_healthy=true
    
    # Check PostgreSQL
    if check_postgres_health; then
        log_success "PostgreSQL database is healthy"
    else
        log_error "PostgreSQL database health check failed"
        all_databases_healthy=false
    fi
    
    # Check MongoDB
    if check_mongodb_health; then
        log_success "MongoDB database is healthy"
    else
        log_error "MongoDB database health check failed"
        all_databases_healthy=false
    fi
    
    # Check Redis
    if check_redis_health; then
        log_success "Redis cache is healthy"
    else
        log_error "Redis cache health check failed"
        all_databases_healthy=false
    fi
    
    if [[ "$all_databases_healthy" == "true" ]]; then
        return 0
    else
        return 1
    fi
}

# Check PostgreSQL health
check_postgres_health() {
    local namespace="austa-cockpit-${ENVIRONMENT}"
    
    # Try to connect using a test pod
    kubectl run postgres-health-check --image=postgres:15 --rm -i --restart=Never \
        --timeout="${TIMEOUT}s" \
        --env="PGPASSWORD=${DB_PASSWORD:-}" \
        -- pg_isready -h "${DB_HOST:-postgres}" -p 5432 -U "${DB_USERNAME:-postgres}" &> /dev/null
}

# Check MongoDB health
check_mongodb_health() {
    local namespace="austa-cockpit-${ENVIRONMENT}"
    
    # Try to connect using a test pod
    kubectl run mongodb-health-check --image=mongo:7 --rm -i --restart=Never \
        --timeout="${TIMEOUT}s" \
        -- mongosh "${MONGODB_HOST:-mongodb}:27017" --eval "db.adminCommand('ping')" &> /dev/null
}

# Check Redis health
check_redis_health() {
    local namespace="austa-cockpit-${ENVIRONMENT}"
    
    # Try to connect using a test pod
    kubectl run redis-health-check --image=redis:7 --rm -i --restart=Never \
        --timeout="${TIMEOUT}s" \
        -- redis-cli -h "${REDIS_HOST:-redis}" -p 6379 ping &> /dev/null
}

# Check ingress and load balancer
check_ingress() {
    log_step "Checking ingress and load balancer"
    
    local namespace="austa-cockpit-${ENVIRONMENT}"
    
    # Check ingress controller
    if kubectl get pods -n ingress-nginx -l app.kubernetes.io/component=controller --no-headers | grep -q Running; then
        log_success "Ingress controller is running"
    else
        log_error "Ingress controller is not running"
        return 1
    fi
    
    # Check application ingress
    if kubectl get ingress -n "$namespace" &> /dev/null; then
        local ingress_count
        ingress_count=$(kubectl get ingress -n "$namespace" --no-headers | wc -l)
        log_success "Found $ingress_count ingress resources"
    else
        log_warning "No ingress resources found"
    fi
    
    # Check load balancer service
    local lb_services
    if lb_services=$(kubectl get svc -n "$namespace" --field-selector spec.type=LoadBalancer --no-headers 2>/dev/null); then
        if [[ -n "$lb_services" ]]; then
            log_success "Load balancer services found"
            
            if [[ "$DETAILED" == "true" ]]; then
                echo "$lb_services" | while read -r line; do
                    local svc_name external_ip
                    read -r svc_name _ _ external_ip _ <<< "$line"
                    log_info "Service: $svc_name | External IP: $external_ip"
                done
            fi
        else
            log_warning "No load balancer services found"
        fi
    fi
    
    return 0
}

# Check SSL certificates
check_ssl_certificates() {
    log_step "Checking SSL certificates"
    
    local namespace="austa-cockpit-${ENVIRONMENT}"
    
    # Check cert-manager
    if kubectl get pods -n cert-manager -l app=cert-manager --no-headers | grep -q Running; then
        log_success "cert-manager is running"
    else
        log_warning "cert-manager is not running"
        return 1
    fi
    
    # Check certificates
    local certs
    if certs=$(kubectl get certificates -n "$namespace" --no-headers 2>/dev/null); then
        if [[ -n "$certs" ]]; then
            local all_certs_ready=true
            
            echo "$certs" | while read -r line; do
                local cert_name ready secret age
                read -r cert_name ready secret age <<< "$line"
                
                if [[ "$ready" == "True" ]]; then
                    log_success "Certificate $cert_name is ready"
                else
                    log_error "Certificate $cert_name is not ready"
                    all_certs_ready=false
                fi
            done
            
            if [[ "$all_certs_ready" == "true" ]]; then
                return 0
            else
                return 1
            fi
        else
            log_warning "No certificates found"
            return 1
        fi
    else
        log_warning "Cannot check certificates"
        return 1
    fi
}

# Check monitoring systems
check_monitoring() {
    log_step "Checking monitoring systems"
    
    # Check Prometheus
    if kubectl get pods -n monitoring -l app.kubernetes.io/name=prometheus --no-headers | grep -q Running; then
        log_success "Prometheus is running"
    else
        log_warning "Prometheus is not running"
    fi
    
    # Check Grafana
    if kubectl get pods -n monitoring -l app.kubernetes.io/name=grafana --no-headers | grep -q Running; then
        log_success "Grafana is running"
    else
        log_warning "Grafana is not running"
    fi
    
    # Check metrics server
    if kubectl get pods -n kube-system -l k8s-app=metrics-server --no-headers | grep -q Running; then
        log_success "Metrics server is running"
    else
        log_warning "Metrics server is not running"
    fi
    
    return 0
}

# Check storage systems
check_storage() {
    log_step "Checking storage systems"
    
    # Check persistent volumes
    local pv_count
    pv_count=$(kubectl get pv --no-headers 2>/dev/null | wc -l)
    
    if [[ $pv_count -gt 0 ]]; then
        log_success "Found $pv_count persistent volumes"
        
        # Check for failed PVs
        local failed_pvs
        failed_pvs=$(kubectl get pv --no-headers | grep -v Available | grep -v Bound | wc -l)
        
        if [[ $failed_pvs -gt 0 ]]; then
            log_warning "$failed_pvs persistent volumes are not healthy"
        fi
    else
        log_warning "No persistent volumes found"
    fi
    
    # Check persistent volume claims
    local namespace="austa-cockpit-${ENVIRONMENT}"
    local pvc_count
    pvc_count=$(kubectl get pvc -n "$namespace" --no-headers 2>/dev/null | wc -l)
    
    if [[ $pvc_count -gt 0 ]]; then
        log_success "Found $pvc_count persistent volume claims"
        
        # Check for pending PVCs
        local pending_pvcs
        pending_pvcs=$(kubectl get pvc -n "$namespace" --no-headers | grep Pending | wc -l)
        
        if [[ $pending_pvcs -gt 0 ]]; then
            log_error "$pending_pvcs persistent volume claims are pending"
            return 1
        fi
    fi
    
    return 0
}

# Generate health report
generate_report() {
    echo
    echo "Health Check Summary:"
    echo "===================="
    echo "Environment:      $ENVIRONMENT"
    echo "Total Checks:     $TOTAL_CHECKS"
    echo "Passed:           $PASSED_CHECKS"
    echo "Failed:           $FAILED_CHECKS"
    echo "Warnings:         $WARNING_CHECKS"
    echo "Success Rate:     $(( (PASSED_CHECKS * 100) / TOTAL_CHECKS ))%"
    echo
    
    if [[ $FAILED_CHECKS -eq 0 ]]; then
        log_success "All critical health checks passed!"
        return 0
    else
        log_error "$FAILED_CHECKS critical health checks failed!"
        return 1
    fi
}

# Main health check function
main() {
    log_info "Starting health checks for environment: $ENVIRONMENT"
    
    if [[ "$VERBOSE" == "true" ]]; then
        log_info "Timeout: ${TIMEOUT}s | Retries: $RETRIES | Detailed: $DETAILED"
    fi
    
    echo
    
    # Run all health checks
    check_kubectl
    check_namespace
    check_pods
    check_services
    check_databases
    check_ingress
    check_ssl_certificates
    check_monitoring
    check_storage
    
    # Generate final report
    generate_report
}

# Parse arguments and run
parse_args "$@"
validate_args
main