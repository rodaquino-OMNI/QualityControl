#!/bin/bash
# AUSTA Cockpit Blue-Green Deployment Script
# Implements zero-downtime blue-green deployment strategy

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../" && pwd)"
DEPLOYMENT_DIR="${PROJECT_ROOT}/deployment"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Global variables
ENVIRONMENT=""
VERSION="latest"
DRY_RUN=false
VERBOSE=false
TIMEOUT=600  # 10 minutes default timeout

# Current deployment state
CURRENT_SLOT=""
TARGET_SLOT=""
LOAD_BALANCER=""

# Logging functions
log_info() {
    echo -e "${BLUE}[BLUE-GREEN]${NC} $1"
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
AUSTA Cockpit Blue-Green Deployment

Usage: $0 [options]

Options:
    -e, --environment <env>         Target environment (staging|production)
    -v, --version <version>         Version to deploy (default: latest)
    --timeout <seconds>             Deployment timeout (default: 600)
    --dry-run                       Show what would be done without executing
    --verbose                       Enable verbose output
    -h, --help                      Show this help message

Blue-Green Deployment Process:
    1. Identify current active slot (blue or green)
    2. Deploy new version to inactive slot
    3. Run health checks on new deployment
    4. Switch load balancer to new slot
    5. Verify traffic routing
    6. Keep old slot for quick rollback

Examples:
    $0 --environment staging --version v1.2.3
    $0 --environment production --version latest --timeout 900
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
            -v|--version)
                VERSION="$2"
                shift 2
                ;;
            --timeout)
                TIMEOUT="$2"
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
    if [[ -z "$ENVIRONMENT" ]]; then
        log_error "Environment is required"
        show_help
        exit 1
    fi
    
    if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
        log_error "Blue-green deployment is only supported for staging and production"
        exit 1
    fi
}

# Determine current deployment slots
determine_slots() {
    log_step "Determining current deployment slots..."
    
    # Check which slot is currently active
    if kubectl get service "austa-cockpit-${ENVIRONMENT}" -o jsonpath='{.spec.selector.slot}' | grep -q "blue"; then
        CURRENT_SLOT="blue"
        TARGET_SLOT="green"
    else
        CURRENT_SLOT="green"
        TARGET_SLOT="blue"
    fi
    
    log_info "Current active slot: $CURRENT_SLOT"
    log_info "Target deployment slot: $TARGET_SLOT"
}

# Deploy to target slot
deploy_to_slot() {
    log_step "Deploying version $VERSION to $TARGET_SLOT slot..."
    
    # Create namespace if it doesn't exist
    if [[ "$DRY_RUN" != "true" ]]; then
        kubectl create namespace "austa-cockpit-${ENVIRONMENT}" --dry-run=client -o yaml | kubectl apply -f -
    fi
    
    # Prepare deployment manifest
    local deployment_manifest="/tmp/austa-cockpit-${TARGET_SLOT}-${ENVIRONMENT}.yaml"
    
    cat > "$deployment_manifest" << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: austa-cockpit-${TARGET_SLOT}
  namespace: austa-cockpit-${ENVIRONMENT}
  labels:
    app: austa-cockpit
    slot: ${TARGET_SLOT}
    environment: ${ENVIRONMENT}
    version: ${VERSION}
spec:
  replicas: 3
  selector:
    matchLabels:
      app: austa-cockpit
      slot: ${TARGET_SLOT}
  template:
    metadata:
      labels:
        app: austa-cockpit
        slot: ${TARGET_SLOT}
        environment: ${ENVIRONMENT}
        version: ${VERSION}
    spec:
      containers:
      - name: frontend
        image: austa-cockpit/frontend:${VERSION}
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: ${ENVIRONMENT}
        - name: SLOT
          value: ${TARGET_SLOT}
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
      - name: backend
        image: austa-cockpit/backend:${VERSION}
        ports:
        - containerPort: 8080
        env:
        - name: NODE_ENV
          value: ${ENVIRONMENT}
        - name: SLOT
          value: ${TARGET_SLOT}
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            cpu: 200m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 1Gi
      - name: ai-service
        image: austa-cockpit/ai-service:${VERSION}
        ports:
        - containerPort: 8000
        env:
        - name: ENVIRONMENT
          value: ${ENVIRONMENT}
        - name: SLOT
          value: ${TARGET_SLOT}
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 60
          periodSeconds: 15
        readinessProbe:
          httpGet:
            path: /ready
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 10
        resources:
          requests:
            cpu: 500m
            memory: 2Gi
          limits:
            cpu: 2000m
            memory: 4Gi
---
apiVersion: v1
kind: Service
metadata:
  name: austa-cockpit-${TARGET_SLOT}
  namespace: austa-cockpit-${ENVIRONMENT}
  labels:
    app: austa-cockpit
    slot: ${TARGET_SLOT}
spec:
  selector:
    app: austa-cockpit
    slot: ${TARGET_SLOT}
  ports:
  - name: frontend
    port: 3000
    targetPort: 3000
  - name: backend
    port: 8080
    targetPort: 8080
  - name: ai-service
    port: 8000
    targetPort: 8000
  type: ClusterIP
EOF
    
    # Apply deployment
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would apply deployment manifest"
        cat "$deployment_manifest"
    else
        kubectl apply -f "$deployment_manifest"
        
        # Wait for deployment to be ready
        log_info "Waiting for deployment to be ready..."
        kubectl rollout status deployment/austa-cockpit-${TARGET_SLOT} \
            -n "austa-cockpit-${ENVIRONMENT}" \
            --timeout="${TIMEOUT}s"
    fi
    
    # Cleanup manifest
    rm -f "$deployment_manifest"
    
    log_success "Deployment to $TARGET_SLOT slot completed"
}

# Run health checks on target slot
health_check_target_slot() {
    log_step "Running health checks on $TARGET_SLOT slot..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would run health checks"
        return 0
    fi
    
    # Get service endpoint
    local service_ip
    service_ip=$(kubectl get service "austa-cockpit-${TARGET_SLOT}" \
        -n "austa-cockpit-${ENVIRONMENT}" \
        -o jsonpath='{.spec.clusterIP}')
    
    if [[ -z "$service_ip" ]]; then
        log_error "Could not get service IP for $TARGET_SLOT slot"
        return 1
    fi
    
    log_info "Testing service endpoints..."
    
    # Test frontend health
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        log_info "Health check attempt $attempt/$max_attempts"
        
        # Check frontend
        if curl -sf "http://${service_ip}:3000/health" > /dev/null; then
            log_info "Frontend health check passed"
        else
            log_warning "Frontend health check failed (attempt $attempt)"
            sleep 10
            ((attempt++))
            continue
        fi
        
        # Check backend
        if curl -sf "http://${service_ip}:8080/health" > /dev/null; then
            log_info "Backend health check passed"
        else
            log_warning "Backend health check failed (attempt $attempt)"
            sleep 10
            ((attempt++))
            continue
        fi
        
        # Check AI service
        if curl -sf "http://${service_ip}:8000/health" > /dev/null; then
            log_info "AI service health check passed"
        else
            log_warning "AI service health check failed (attempt $attempt)"
            sleep 10
            ((attempt++))
            continue
        fi
        
        # All health checks passed
        log_success "All health checks passed for $TARGET_SLOT slot"
        return 0
    done
    
    log_error "Health checks failed after $max_attempts attempts"
    return 1
}

# Switch load balancer to target slot
switch_load_balancer() {
    log_step "Switching load balancer to $TARGET_SLOT slot..."
    
    # Update main service to point to target slot
    local service_manifest="/tmp/austa-cockpit-service-${ENVIRONMENT}.yaml"
    
    cat > "$service_manifest" << EOF
apiVersion: v1
kind: Service
metadata:
  name: austa-cockpit-${ENVIRONMENT}
  namespace: austa-cockpit-${ENVIRONMENT}
  labels:
    app: austa-cockpit
    environment: ${ENVIRONMENT}
spec:
  selector:
    app: austa-cockpit
    slot: ${TARGET_SLOT}
  ports:
  - name: frontend
    port: 3000
    targetPort: 3000
  - name: backend
    port: 8080
    targetPort: 8080
  - name: ai-service
    port: 8000
    targetPort: 8000
  type: LoadBalancer
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: austa-cockpit-${ENVIRONMENT}
  namespace: austa-cockpit-${ENVIRONMENT}
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - ${ENVIRONMENT}.austa-cockpit.com
    secretName: austa-cockpit-${ENVIRONMENT}-tls
  rules:
  - host: ${ENVIRONMENT}.austa-cockpit.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: austa-cockpit-${ENVIRONMENT}
            port:
              number: 3000
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: austa-cockpit-${ENVIRONMENT}
            port:
              number: 8080
      - path: /ai
        pathType: Prefix
        backend:
          service:
            name: austa-cockpit-${ENVIRONMENT}
            port:
              number: 8000
EOF
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would update load balancer configuration"
        cat "$service_manifest"
    else
        kubectl apply -f "$service_manifest"
        log_success "Load balancer switched to $TARGET_SLOT slot"
    fi
    
    # Cleanup manifest
    rm -f "$service_manifest"
}

# Verify traffic routing
verify_traffic_routing() {
    log_step "Verifying traffic routing to $TARGET_SLOT slot..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would verify traffic routing"
        return 0
    fi
    
    # Get external IP
    local external_ip
    local attempts=0
    local max_attempts=30
    
    while [[ $attempts -lt $max_attempts ]]; do
        external_ip=$(kubectl get service "austa-cockpit-${ENVIRONMENT}" \
            -n "austa-cockpit-${ENVIRONMENT}" \
            -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
        
        if [[ -n "$external_ip" && "$external_ip" != "<pending>" ]]; then
            break
        fi
        
        log_info "Waiting for external IP... (attempt $((attempts+1))/$max_attempts)"
        sleep 10
        ((attempts++))
    done
    
    if [[ -z "$external_ip" || "$external_ip" == "<pending>" ]]; then
        log_warning "Could not get external IP, using service name for verification"
        external_ip="${ENVIRONMENT}.austa-cockpit.com"
    fi
    
    log_info "Testing external endpoint: $external_ip"
    
    # Test external access
    local test_attempts=10
    local test_success=0
    
    for ((i=1; i<=test_attempts; i++)); do
        if curl -sf "http://${external_ip}/health" > /dev/null; then
            ((test_success++))
        fi
        sleep 2
    done
    
    local success_rate=$((test_success * 100 / test_attempts))
    log_info "Traffic routing success rate: ${success_rate}%"
    
    if [[ $success_rate -ge 90 ]]; then
        log_success "Traffic routing verification passed"
        return 0
    else
        log_error "Traffic routing verification failed (${success_rate}% success rate)"
        return 1
    fi
}

# Cleanup old slot (optional)
cleanup_old_slot() {
    log_step "Cleaning up old slot: $CURRENT_SLOT"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would cleanup old slot"
        return 0
    fi
    
    # Keep old slot for quick rollback - don't delete immediately
    log_info "Keeping old slot ($CURRENT_SLOT) for potential rollback"
    log_info "To cleanup old slot later, run:"
    log_info "kubectl delete deployment austa-cockpit-${CURRENT_SLOT} -n austa-cockpit-${ENVIRONMENT}"
    log_info "kubectl delete service austa-cockpit-${CURRENT_SLOT} -n austa-cockpit-${ENVIRONMENT}"
}

# Rollback to previous slot
rollback_to_previous_slot() {
    log_error "Rolling back to previous slot: $CURRENT_SLOT"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would rollback to previous slot"
        return 0
    fi
    
    # Switch load balancer back to current slot
    local service_manifest="/tmp/austa-cockpit-rollback-${ENVIRONMENT}.yaml"
    
    cat > "$service_manifest" << EOF
apiVersion: v1
kind: Service
metadata:
  name: austa-cockpit-${ENVIRONMENT}
  namespace: austa-cockpit-${ENVIRONMENT}
  labels:
    app: austa-cockpit
    environment: ${ENVIRONMENT}
spec:
  selector:
    app: austa-cockpit
    slot: ${CURRENT_SLOT}
  ports:
  - name: frontend
    port: 3000
    targetPort: 3000
  - name: backend
    port: 8080
    targetPort: 8080
  - name: ai-service
    port: 8000
    targetPort: 8000
  type: LoadBalancer
EOF
    
    kubectl apply -f "$service_manifest"
    rm -f "$service_manifest"
    
    # Delete failed deployment
    kubectl delete deployment "austa-cockpit-${TARGET_SLOT}" -n "austa-cockpit-${ENVIRONMENT}" || true
    kubectl delete service "austa-cockpit-${TARGET_SLOT}" -n "austa-cockpit-${ENVIRONMENT}" || true
    
    log_success "Rollback completed"
}

# Main deployment function
main() {
    log_info "Starting blue-green deployment..."
    log_info "Environment: $ENVIRONMENT | Version: $VERSION | Target: $TARGET_SLOT"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "DRY RUN MODE - No actual changes will be made"
    fi
    
    # Setup error handling
    trap 'rollback_to_previous_slot; exit 1' ERR
    
    # Blue-green deployment pipeline
    determine_slots
    deploy_to_slot
    
    if health_check_target_slot; then
        switch_load_balancer
        
        if verify_traffic_routing; then
            cleanup_old_slot
            log_success "Blue-green deployment completed successfully!"
            log_info "Active slot is now: $TARGET_SLOT"
        else
            log_error "Traffic routing verification failed"
            exit 1
        fi
    else
        log_error "Health checks failed for target slot"
        exit 1
    fi
}

# Parse arguments and run
parse_args "$@"
validate_args
main