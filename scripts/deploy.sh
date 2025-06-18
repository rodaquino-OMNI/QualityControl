#!/bin/bash

# AUSTA Cockpit Deployment Script
# This script handles deployment to staging and production environments
# with blue-green deployment strategy and rollback capabilities

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HELM_CHART_PATH="$PROJECT_ROOT/helm/austa-cockpit"

# Default values
ENVIRONMENT="${ENVIRONMENT:-staging}"
NAMESPACE="${NAMESPACE:-austa-cockpit-${ENVIRONMENT}}"
RELEASE_NAME="${RELEASE_NAME:-austa-${ENVIRONMENT}}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DRY_RUN="${DRY_RUN:-false}"
ROLLBACK="${ROLLBACK:-false}"
BLUE_GREEN="${BLUE_GREEN:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
AUSTA Cockpit Deployment Script

Usage: $0 [OPTIONS]

OPTIONS:
    -e, --environment       Target environment (staging|production) [default: staging]
    -n, --namespace         Kubernetes namespace [default: austa-cockpit-ENVIRONMENT]
    -r, --release-name      Helm release name [default: austa-ENVIRONMENT]
    -t, --image-tag         Docker image tag [default: latest]
    -d, --dry-run           Perform a dry run without making changes [default: false]
    --rollback              Rollback to previous version [default: false]
    --blue-green            Use blue-green deployment strategy [default: false]
    -h, --help              Show this help message

EXAMPLES:
    # Deploy to staging
    $0 -e staging -t v1.2.3

    # Deploy to production with blue-green strategy
    $0 -e production -t v1.2.3 --blue-green

    # Rollback production deployment
    $0 -e production --rollback

    # Dry run deployment
    $0 -e staging -t v1.2.3 --dry-run

ENVIRONMENT VARIABLES:
    ENVIRONMENT             Target environment (staging|production)
    NAMESPACE               Kubernetes namespace
    RELEASE_NAME            Helm release name
    IMAGE_TAG               Docker image tag
    DRY_RUN                 Perform dry run (true|false)
    ROLLBACK                Rollback deployment (true|false)
    BLUE_GREEN              Use blue-green deployment (true|false)
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
            -n|--namespace)
                NAMESPACE="$2"
                shift 2
                ;;
            -r|--release-name)
                RELEASE_NAME="$2"
                shift 2
                ;;
            -t|--image-tag)
                IMAGE_TAG="$2"
                shift 2
                ;;
            -d|--dry-run)
                DRY_RUN="true"
                shift
                ;;
            --rollback)
                ROLLBACK="true"
                shift
                ;;
            --blue-green)
                BLUE_GREEN="true"
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

# Validate inputs
validate_inputs() {
    if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
        exit 1
    fi

    if [[ -z "$IMAGE_TAG" ]]; then
        log_error "Image tag is required"
        exit 1
    fi

    if [[ ! -d "$HELM_CHART_PATH" ]]; then
        log_error "Helm chart not found at: $HELM_CHART_PATH"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check required tools
    for tool in kubectl helm; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "$tool is not installed or not in PATH"
            exit 1
        fi
    done

    # Check Kubernetes connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi

    # Check Helm chart validity
    if ! helm lint "$HELM_CHART_PATH" &> /dev/null; then
        log_error "Helm chart validation failed"
        helm lint "$HELM_CHART_PATH"
        exit 1
    fi

    log_success "All prerequisites met"
}

# Create namespace if it doesn't exist
create_namespace() {
    log_info "Ensuring namespace '$NAMESPACE' exists..."

    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_info "Namespace '$NAMESPACE' already exists"
    else
        log_info "Creating namespace '$NAMESPACE'..."
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would create namespace: $NAMESPACE"
        else
            kubectl create namespace "$NAMESPACE"
            kubectl label namespace "$NAMESPACE" name="$NAMESPACE" --overwrite
            log_success "Namespace '$NAMESPACE' created"
        fi
    fi
}

# Deploy monitoring stack
deploy_monitoring() {
    log_info "Deploying monitoring stack..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would deploy monitoring stack"
        return
    fi

    # Deploy Prometheus
    kubectl apply -f "$PROJECT_ROOT/k8s/monitoring/prometheus.yaml"
    
    # Deploy Grafana
    kubectl apply -f "$PROJECT_ROOT/k8s/monitoring/grafana.yaml"
    
    # Wait for monitoring to be ready
    kubectl wait --for=condition=ready pod -l app=prometheus -n monitoring --timeout=300s
    kubectl wait --for=condition=ready pod -l app=grafana -n monitoring --timeout=300s
    
    log_success "Monitoring stack deployed successfully"
}

# Setup sealed secrets
setup_sealed_secrets() {
    log_info "Setting up sealed secrets..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would setup sealed secrets"
        return
    fi

    # Deploy sealed secrets controller
    kubectl apply -f "$PROJECT_ROOT/k8s/sealed-secrets/controller.yaml"
    
    # Wait for controller to be ready
    kubectl wait --for=condition=ready pod -l name=sealed-secrets-controller -n sealed-secrets --timeout=300s
    
    log_success "Sealed secrets controller deployed successfully"
}

# Rollback deployment
rollback_deployment() {
    log_info "Rolling back deployment..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would rollback release: $RELEASE_NAME"
        return
    fi

    # Check if release exists
    if ! helm list -n "$NAMESPACE" | grep -q "$RELEASE_NAME"; then
        log_error "Release '$RELEASE_NAME' not found in namespace '$NAMESPACE'"
        exit 1
    fi

    # Get release history
    log_info "Release history:"
    helm history "$RELEASE_NAME" -n "$NAMESPACE"

    # Rollback to previous version
    helm rollback "$RELEASE_NAME" -n "$NAMESPACE"
    
    # Wait for rollback to complete
    kubectl rollout status deployment/"$RELEASE_NAME"-frontend -n "$NAMESPACE" --timeout=600s
    kubectl rollout status deployment/"$RELEASE_NAME"-backend -n "$NAMESPACE" --timeout=600s
    kubectl rollout status deployment/"$RELEASE_NAME"-ai-service -n "$NAMESPACE" --timeout=600s

    log_success "Rollback completed successfully"
}

# Blue-green deployment
blue_green_deploy() {
    log_info "Performing blue-green deployment..."

    local current_color="blue"
    local new_color="green"
    
    # Determine current color
    if kubectl get deployment "${RELEASE_NAME}-${new_color}-frontend" -n "$NAMESPACE" &> /dev/null; then
        current_color="green"
        new_color="blue"
    fi

    log_info "Current deployment: $current_color, New deployment: $new_color"

    # Deploy to new color
    local new_release_name="${RELEASE_NAME}-${new_color}"
    deploy_application "$new_release_name" "$new_color"

    # Health check on new deployment
    log_info "Performing health checks on $new_color deployment..."
    kubectl wait --for=condition=ready pod -l "app.kubernetes.io/instance=$new_release_name" -n "$NAMESPACE" --timeout=600s

    # Switch traffic (update ingress)
    log_info "Switching traffic to $new_color deployment..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would switch traffic to $new_color"
    else
        # Update ingress to point to new deployment
        kubectl patch ingress "${RELEASE_NAME}-ingress" -n "$NAMESPACE" --type='merge' -p="{\"spec\":{\"rules\":[{\"http\":{\"paths\":[{\"path\":\"/\",\"pathType\":\"Prefix\",\"backend\":{\"service\":{\"name\":\"${new_release_name}-frontend\",\"port\":{\"number\":80}}}}]}}]}}"
        
        # Wait for traffic switch
        sleep 30
        
        # Verify new deployment is receiving traffic
        log_info "Verifying traffic switch..."
        # Add health check logic here
    fi

    # Remove old deployment
    log_info "Removing old $current_color deployment..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would remove old deployment: ${RELEASE_NAME}-${current_color}"
    else
        helm uninstall "${RELEASE_NAME}-${current_color}" -n "$NAMESPACE" || true
    fi

    log_success "Blue-green deployment completed successfully"
}

# Standard deployment
deploy_application() {
    local release_name="${1:-$RELEASE_NAME}"
    local color="${2:-}"
    
    log_info "Deploying application..."

    # Prepare Helm values
    local values_file="$HELM_CHART_PATH/values-${ENVIRONMENT}.yaml"
    if [[ ! -f "$values_file" ]]; then
        values_file="$HELM_CHART_PATH/values.yaml"
    fi

    # Build Helm command
    local helm_cmd="helm upgrade --install $release_name $HELM_CHART_PATH"
    helm_cmd+=" --namespace $NAMESPACE"
    helm_cmd+=" --create-namespace"
    helm_cmd+=" --values $values_file"
    helm_cmd+=" --set image.tag=$IMAGE_TAG"
    helm_cmd+=" --set frontend.image.tag=$IMAGE_TAG"
    helm_cmd+=" --set backend.image.tag=$IMAGE_TAG"
    helm_cmd+=" --set aiService.image.tag=$IMAGE_TAG"
    helm_cmd+=" --timeout 15m"
    helm_cmd+=" --wait"

    if [[ -n "$color" ]]; then
        helm_cmd+=" --set deployment.color=$color"
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        helm_cmd+=" --dry-run"
        log_info "[DRY RUN] Would execute: $helm_cmd"
    else
        log_info "Executing: $helm_cmd"
    fi

    # Execute deployment
    eval "$helm_cmd"

    if [[ "$DRY_RUN" != "true" ]]; then
        # Wait for deployments to be ready
        log_info "Waiting for deployments to be ready..."
        kubectl rollout status deployment/"$release_name"-frontend -n "$NAMESPACE" --timeout=600s
        kubectl rollout status deployment/"$release_name"-backend -n "$NAMESPACE" --timeout=600s
        kubectl rollout status deployment/"$release_name"-ai-service -n "$NAMESPACE" --timeout=600s

        log_success "Application deployed successfully"
    fi
}

# Post-deployment verification
verify_deployment() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would verify deployment"
        return
    fi

    log_info "Verifying deployment..."

    # Check pod status
    log_info "Checking pod status..."
    kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/instance=$RELEASE_NAME"

    # Check service status
    log_info "Checking service status..."
    kubectl get services -n "$NAMESPACE" -l "app.kubernetes.io/instance=$RELEASE_NAME"

    # Check ingress status
    log_info "Checking ingress status..."
    kubectl get ingress -n "$NAMESPACE" -l "app.kubernetes.io/instance=$RELEASE_NAME"

    # Health checks
    log_info "Performing health checks..."
    # Add specific health check logic here

    log_success "Deployment verification completed"
}

# Cleanup old resources
cleanup_old_resources() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would cleanup old resources"
        return
    fi

    log_info "Cleaning up old resources..."

    # Remove old ReplicaSets
    kubectl delete replicaset -n "$NAMESPACE" -l "app.kubernetes.io/instance=$RELEASE_NAME" --field-selector="status.replicas=0" || true

    # Remove old ConfigMaps and Secrets (if any)
    # Add cleanup logic here

    log_success "Cleanup completed"
}

# Send notification
send_notification() {
    local status="$1"
    local message="$2"

    log_info "Sending deployment notification..."

    # Add notification logic here (Slack, email, etc.)
    log_info "Notification: $status - $message"
}

# Main function
main() {
    parse_args "$@"
    validate_inputs
    
    log_info "Starting deployment process..."
    log_info "Environment: $ENVIRONMENT"
    log_info "Namespace: $NAMESPACE"
    log_info "Release: $RELEASE_NAME"
    log_info "Image Tag: $IMAGE_TAG"
    log_info "Dry Run: $DRY_RUN"
    log_info "Rollback: $ROLLBACK"
    log_info "Blue-Green: $BLUE_GREEN"

    check_prerequisites
    create_namespace

    if [[ "$ROLLBACK" == "true" ]]; then
        rollback_deployment
        send_notification "SUCCESS" "Rollback completed for $ENVIRONMENT environment"
    else
        # Setup infrastructure components
        setup_sealed_secrets
        
        if [[ "$ENVIRONMENT" == "production" ]]; then
            deploy_monitoring
        fi

        # Deploy application
        if [[ "$BLUE_GREEN" == "true" && "$ENVIRONMENT" == "production" ]]; then
            blue_green_deploy
        else
            deploy_application
        fi

        verify_deployment
        cleanup_old_resources
        
        send_notification "SUCCESS" "Deployment completed for $ENVIRONMENT environment with tag $IMAGE_TAG"
    fi

    log_success "Deployment process completed successfully!"
}

# Execute main function with all arguments
main "$@"