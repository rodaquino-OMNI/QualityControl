#!/bin/bash
# AUSTA Cockpit Main Deployment Orchestrator
# Coordinates all deployment strategies and validation

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../" && pwd)"
DEPLOYMENT_DIR="${PROJECT_ROOT}/deployment"
CONFIG_DIR="${DEPLOYMENT_DIR}/config"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Global variables
ENVIRONMENT=""
STRATEGY=""
VERSION=""
DRY_RUN=false
VERBOSE=false
APPROVAL_REQUIRED=false
BACKUP_BEFORE=false
SKIP_TESTS=false
FORCE=false

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
AUSTA Cockpit Deployment Orchestrator

Usage: $0 [options]

Options:
    -e, --environment <env>         Target environment (development|staging|production)
    -s, --strategy <strategy>       Deployment strategy (rolling|blue-green|canary)
    -v, --version <version>         Version to deploy (default: latest)
    --dry-run                       Show what would be done without executing
    --verbose                       Enable verbose output
    --approval-required             Require manual approval before deployment
    --backup-before                 Create backup before deployment
    --skip-tests                    Skip pre-deployment tests
    --force                         Force deployment without confirmations
    -h, --help                      Show this help message

Deployment Strategies:
    rolling         Rolling update (default for development)
    blue-green      Blue-green deployment (recommended for staging)
    canary          Canary deployment (required for production)

Examples:
    $0 --environment development --strategy rolling
    $0 --environment staging --strategy blue-green --backup-before
    $0 --environment production --strategy canary --approval-required
    $0 --environment production --version v1.2.3 --strategy canary

Prerequisites:
    - Docker and Docker Compose installed
    - Kubernetes cluster access configured
    - AWS/GCP/Azure CLI configured (for cloud deployments)
    - Valid configuration files in deployment/config/
EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -s|--strategy)
                STRATEGY="$2"
                shift 2
                ;;
            -v|--version)
                VERSION="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --approval-required)
                APPROVAL_REQUIRED=true
                shift
                ;;
            --backup-before)
                BACKUP_BEFORE=true
                shift
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --force)
                FORCE=true
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
    # Validate environment
    if [[ -z "$ENVIRONMENT" ]]; then
        log_error "Environment is required"
        show_help
        exit 1
    fi
    
    if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT"
        exit 1
    }
    
    # Set default strategy based on environment
    if [[ -z "$STRATEGY" ]]; then
        case "$ENVIRONMENT" in
            development)
                STRATEGY="rolling"
                ;;
            staging)
                STRATEGY="blue-green"
                ;;
            production)
                STRATEGY="canary"
                APPROVAL_REQUIRED=true
                ;;
        esac
    fi
    
    # Validate strategy
    if [[ ! "$STRATEGY" =~ ^(rolling|blue-green|canary)$ ]]; then
        log_error "Invalid strategy: $STRATEGY"
        exit 1
    fi
    
    # Production safety checks
    if [[ "$ENVIRONMENT" == "production" ]]; then
        if [[ "$STRATEGY" != "canary" && "$FORCE" != "true" ]]; then
            log_error "Production deployments must use canary strategy (use --force to override)"
            exit 1
        fi
        
        APPROVAL_REQUIRED=true
        BACKUP_BEFORE=true
    fi
    
    # Set default version
    if [[ -z "$VERSION" ]]; then
        VERSION="latest"
    fi
}

# Load configuration
load_config() {
    local config_file="${CONFIG_DIR}/${ENVIRONMENT}.yaml"
    
    if [[ ! -f "$config_file" ]]; then
        log_error "Configuration file not found: $config_file"
        exit 1
    fi
    
    log_info "Loading configuration for environment: $ENVIRONMENT"
    
    # Validate configuration
    "${CONFIG_DIR}/config-manager.sh" validate "$ENVIRONMENT"
}

# Pre-deployment checks
pre_deployment_checks() {
    log_step "Running pre-deployment checks..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available"
        exit 1
    fi
    
    # Check Kubernetes access for production
    if [[ "$ENVIRONMENT" == "production" || "$ENVIRONMENT" == "staging" ]]; then
        if ! command -v kubectl &> /dev/null; then
            log_error "kubectl is not installed or not in PATH"
            exit 1
        fi
        
        if ! kubectl cluster-info &> /dev/null; then
            log_error "Cannot connect to Kubernetes cluster"
            exit 1
        fi
    fi
    
    # Check if services are healthy
    log_info "Checking current service health..."
    if ! "${SCRIPT_DIR}/../validation/health-checks/service-health.sh" "$ENVIRONMENT"; then
        if [[ "$FORCE" != "true" ]]; then
            log_error "Current services are not healthy. Use --force to proceed anyway."
            exit 1
        else
            log_warning "Proceeding with unhealthy services due to --force flag"
        fi
    fi
    
    log_success "Pre-deployment checks passed"
}

# Run pre-deployment tests
run_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        log_warning "Skipping tests due to --skip-tests flag"
        return 0
    fi
    
    log_step "Running pre-deployment tests..."
    
    # Unit tests
    log_info "Running unit tests..."
    if ! npm test --prefix "${PROJECT_ROOT}"; then
        log_error "Unit tests failed"
        exit 1
    fi
    
    # Integration tests
    log_info "Running integration tests..."
    if ! npm run test:integration --prefix "${PROJECT_ROOT}"; then
        log_error "Integration tests failed"
        exit 1
    fi
    
    # E2E tests for non-production
    if [[ "$ENVIRONMENT" != "production" ]]; then
        log_info "Running E2E tests..."
        if ! npm run test:e2e --prefix "${PROJECT_ROOT}"; then
            log_warning "E2E tests failed, but continuing..."
        fi
    fi
    
    log_success "Tests completed successfully"
}

# Create backup if requested
create_backup() {
    if [[ "$BACKUP_BEFORE" == "true" ]]; then
        log_step "Creating backup before deployment..."
        
        local backup_file
        backup_file=$("${SCRIPT_DIR}/database/migrate.sh" backup "$ENVIRONMENT")
        
        if [[ -f "$backup_file" ]]; then
            log_success "Backup created: $backup_file"
            echo "$backup_file" > "/tmp/deployment_backup_${ENVIRONMENT}"
        else
            log_error "Backup creation failed"
            exit 1
        fi
    fi
}

# Get approval if required
get_approval() {
    if [[ "$APPROVAL_REQUIRED" == "true" && "$FORCE" != "true" ]]; then
        log_step "Deployment approval required"
        
        echo
        echo "Deployment Summary:"
        echo "=================="
        echo "Environment: $ENVIRONMENT"
        echo "Strategy:    $STRATEGY"
        echo "Version:     $VERSION"
        echo "Backup:      $BACKUP_BEFORE"
        echo
        
        read -p "Do you want to proceed with this deployment? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log_info "Deployment cancelled by user"
            exit 0
        fi
    fi
}

# Execute deployment strategy
execute_deployment() {
    log_step "Executing $STRATEGY deployment..."
    
    case "$STRATEGY" in
        rolling)
            "${SCRIPT_DIR}/rolling-deploy.sh" \
                --environment "$ENVIRONMENT" \
                --version "$VERSION" \
                $([ "$DRY_RUN" == "true" ] && echo "--dry-run") \
                $([ "$VERBOSE" == "true" ] && echo "--verbose")
            ;;
        blue-green)
            "${SCRIPT_DIR}/blue-green-deploy.sh" \
                --environment "$ENVIRONMENT" \
                --version "$VERSION" \
                $([ "$DRY_RUN" == "true" ] && echo "--dry-run") \
                $([ "$VERBOSE" == "true" ] && echo "--verbose")
            ;;
        canary)
            "${SCRIPT_DIR}/canary-deploy.sh" \
                --environment "$ENVIRONMENT" \
                --version "$VERSION" \
                $([ "$DRY_RUN" == "true" ] && echo "--dry-run") \
                $([ "$VERBOSE" == "true" ] && echo "--verbose")
            ;;
        *)
            log_error "Unknown deployment strategy: $STRATEGY"
            exit 1
            ;;
    esac
}

# Post-deployment validation
post_deployment_validation() {
    log_step "Running post-deployment validation..."
    
    # Health checks
    log_info "Running health checks..."
    if ! "${SCRIPT_DIR}/../validation/health-checks/service-health.sh" "$ENVIRONMENT"; then
        log_error "Post-deployment health checks failed"
        return 1
    fi
    
    # Smoke tests
    log_info "Running smoke tests..."
    if ! "${SCRIPT_DIR}/../validation/smoke-tests/smoke-test.sh" "$ENVIRONMENT"; then
        log_error "Smoke tests failed"
        return 1
    fi
    
    # Performance tests for production
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log_info "Running performance validation..."
        if ! "${SCRIPT_DIR}/../validation/performance-tests/performance-test.sh" "$ENVIRONMENT"; then
            log_warning "Performance tests failed, but deployment will continue"
        fi
    fi
    
    log_success "Post-deployment validation completed"
}

# Send notifications
send_notifications() {
    local status="$1"
    local message="$2"
    
    log_info "Sending deployment notifications..."
    
    # Use notification script if available
    if [[ -f "${SCRIPT_DIR}/../monitoring/notifications.sh" ]]; then
        "${SCRIPT_DIR}/../monitoring/notifications.sh" \
            --environment "$ENVIRONMENT" \
            --status "$status" \
            --message "$message" \
            --strategy "$STRATEGY" \
            --version "$VERSION"
    fi
}

# Rollback on failure
rollback_deployment() {
    log_error "Deployment failed, initiating rollback..."
    
    if [[ -f "${SCRIPT_DIR}/rollback.sh" ]]; then
        "${SCRIPT_DIR}/rollback.sh" \
            --environment "$ENVIRONMENT" \
            --strategy "$STRATEGY" \
            --reason "Deployment failure"
    fi
    
    # Restore backup if available
    if [[ -f "/tmp/deployment_backup_${ENVIRONMENT}" ]]; then
        local backup_file
        backup_file=$(cat "/tmp/deployment_backup_${ENVIRONMENT}")
        
        if [[ -f "$backup_file" ]]; then
            log_info "Restoring database backup..."
            "${SCRIPT_DIR}/database/migrate.sh" restore "$ENVIRONMENT" "$backup_file"
        fi
    fi
}

# Cleanup temporary files
cleanup() {
    rm -f "/tmp/deployment_backup_${ENVIRONMENT}" 2>/dev/null || true
}

# Main deployment function
main() {
    # Setup trap for cleanup
    trap cleanup EXIT
    trap 'rollback_deployment; cleanup; exit 1' ERR
    
    log_info "Starting AUSTA Cockpit deployment..."
    log_info "Environment: $ENVIRONMENT | Strategy: $STRATEGY | Version: $VERSION"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "DRY RUN MODE - No actual changes will be made"
    fi
    
    # Deployment pipeline
    load_config
    pre_deployment_checks
    run_tests
    create_backup
    get_approval
    
    # Record deployment start
    local start_time=$(date -Iseconds)
    local deployment_id="${ENVIRONMENT}_${STRATEGY}_${start_time}"
    
    send_notifications "started" "Deployment $deployment_id started"
    
    # Execute deployment
    if execute_deployment; then
        if post_deployment_validation; then
            log_success "Deployment completed successfully!"
            send_notifications "success" "Deployment $deployment_id completed successfully"
        else
            log_error "Post-deployment validation failed"
            send_notifications "validation_failed" "Deployment $deployment_id validation failed"
            exit 1
        fi
    else
        log_error "Deployment execution failed"
        send_notifications "failed" "Deployment $deployment_id failed"
        exit 1
    fi
    
    # Final summary
    local end_time=$(date -Iseconds)
    echo
    echo "Deployment Summary:"
    echo "=================="
    echo "Environment:    $ENVIRONMENT"
    echo "Strategy:       $STRATEGY"
    echo "Version:        $VERSION"
    echo "Started:        $start_time"
    echo "Completed:      $end_time"
    echo "Status:         SUCCESS"
    echo
    
    log_success "AUSTA Cockpit deployment completed successfully!"
}

# Parse arguments and run main function
parse_args "$@"
validate_args
main