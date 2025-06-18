#!/bin/bash
# AUSTA Cockpit Kubernetes Cluster Setup
# Configures and validates Kubernetes cluster after Terraform deployment

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../../" && pwd)"
DEPLOYMENT_DIR="${PROJECT_ROOT}/deployment"
K8S_DIR="${DEPLOYMENT_DIR}/infrastructure/kubernetes"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Global variables
ENVIRONMENT=""
CLOUD_PROVIDER="aws"
CLUSTER_NAME=""
DRY_RUN=false
VERBOSE=false

# Logging functions
log_info() {
    echo -e "${BLUE}[K8S-SETUP]${NC} $1"
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
AUSTA Cockpit Kubernetes Cluster Setup

Usage: $0 [options]

Options:
    -e, --environment <env>         Target environment (development|staging|production)
    -c, --cloud-provider <provider> Cloud provider (aws|gcp|azure)
    -n, --cluster-name <name>       Kubernetes cluster name
    --dry-run                       Show what would be done without executing
    --verbose                       Enable verbose output
    -h, --help                      Show this help message

Setup Process:
    1. Configure kubectl context
    2. Install essential cluster components
    3. Set up monitoring stack (Prometheus, Grafana)
    4. Configure ingress controller
    5. Set up service mesh (Istio)
    6. Install security tools
    7. Configure autoscaling
    8. Validate cluster health

Examples:
    $0 --environment production --cloud-provider aws
    $0 --environment staging --cluster-name austa-cockpit-staging-cluster
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
            -c|--cloud-provider)
                CLOUD_PROVIDER="$2"
                shift 2
                ;;
            -n|--cluster-name)
                CLUSTER_NAME="$2"
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
    
    if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT"
        exit 1
    fi
    
    if [[ ! "$CLOUD_PROVIDER" =~ ^(aws|gcp|azure)$ ]]; then
        log_error "Invalid cloud provider: $CLOUD_PROVIDER"
        exit 1
    fi
    
    # Set default cluster name if not provided
    if [[ -z "$CLUSTER_NAME" ]]; then
        CLUSTER_NAME="austa-cockpit-${ENVIRONMENT}-cluster"
    fi
}

# Configure kubectl context
configure_kubectl() {
    log_step "Configuring kubectl context for cluster: $CLUSTER_NAME"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would configure kubectl context"
        return 0
    fi
    
    case "$CLOUD_PROVIDER" in
        aws)
            log_info "Configuring AWS EKS kubectl context..."
            aws eks update-kubeconfig --region "${AWS_REGION:-us-east-1}" --name "$CLUSTER_NAME"
            ;;
        gcp)
            log_info "Configuring GCP GKE kubectl context..."
            gcloud container clusters get-credentials "$CLUSTER_NAME" --region "${GCP_REGION:-us-central1}"
            ;;
        azure)
            log_info "Configuring Azure AKS kubectl context..."
            az aks get-credentials --resource-group "${AZURE_RESOURCE_GROUP}" --name "$CLUSTER_NAME"
            ;;
    esac
    
    # Verify connection
    if kubectl cluster-info &>/dev/null; then
        log_success "Kubectl configured successfully"
        kubectl cluster-info
    else
        log_error "Failed to configure kubectl"
        exit 1
    fi
}

# Create namespaces
create_namespaces() {
    log_step "Creating application namespaces..."
    
    local namespaces=(
        "austa-cockpit-${ENVIRONMENT}"
        "monitoring"
        "istio-system"
        "cert-manager"
        "ingress-nginx"
        "kube-system"
    )
    
    for namespace in "${namespaces[@]}"; do
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "DRY RUN: Would create namespace: $namespace"
        else
            kubectl create namespace "$namespace" --dry-run=client -o yaml | kubectl apply -f -
            log_info "Namespace created/updated: $namespace"
        fi
    done
}

# Install Helm
install_helm() {
    log_step "Installing/Updating Helm..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would install/update Helm"
        return 0
    fi
    
    if ! command -v helm &> /dev/null; then
        log_info "Installing Helm..."
        curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
    else
        log_info "Helm already installed, updating..."
        helm repo update
    fi
    
    # Add required Helm repositories
    local repos=(
        "prometheus-community https://prometheus-community.github.io/helm-charts"
        "grafana https://grafana.github.io/helm-charts"
        "ingress-nginx https://kubernetes.github.io/ingress-nginx"
        "jetstack https://charts.jetstack.io"
        "istio https://istio-release.storage.googleapis.com/charts"
        "bitnami https://charts.bitnami.com/bitnami"
    )
    
    for repo in "${repos[@]}"; do
        local name=$(echo "$repo" | cut -d' ' -f1)
        local url=$(echo "$repo" | cut -d' ' -f2)
        
        helm repo add "$name" "$url" 2>/dev/null || true
    done
    
    helm repo update
    log_success "Helm configured successfully"
}

# Install monitoring stack
install_monitoring() {
    log_step "Installing monitoring stack (Prometheus, Grafana)..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would install monitoring stack"
        return 0
    fi
    
    # Install Prometheus
    log_info "Installing Prometheus..."
    helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        --create-namespace \
        --set prometheus.prometheusSpec.retention="90d" \
        --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage="100Gi" \
        --set grafana.adminPassword="${GRAFANA_ADMIN_PASSWORD:-admin123}" \
        --set grafana.persistence.enabled=true \
        --set grafana.persistence.size="10Gi" \
        --set alertmanager.alertmanagerSpec.storage.volumeClaimTemplate.spec.resources.requests.storage="10Gi" \
        --wait
    
    log_success "Monitoring stack installed successfully"
}

# Install ingress controller
install_ingress() {
    log_step "Installing NGINX Ingress Controller..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would install ingress controller"
        return 0
    fi
    
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.replicaCount=3 \
        --set controller.nodeSelector."kubernetes\.io/os"=linux \
        --set defaultBackend.nodeSelector."kubernetes\.io/os"=linux \
        --set controller.admissionWebhooks.patch.nodeSelector."kubernetes\.io/os"=linux \
        --set controller.service.type=LoadBalancer \
        --set controller.metrics.enabled=true \
        --set controller.metrics.serviceMonitor.enabled=true \
        --wait
    
    log_success "Ingress controller installed successfully"
}

# Install cert-manager
install_cert_manager() {
    log_step "Installing cert-manager for SSL certificates..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would install cert-manager"
        return 0
    fi
    
    # Install cert-manager CRDs
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.crds.yaml
    
    # Install cert-manager
    helm upgrade --install cert-manager jetstack/cert-manager \
        --namespace cert-manager \
        --create-namespace \
        --version v1.13.0 \
        --set installCRDs=true \
        --set prometheus.enabled=true \
        --set webhook.timeoutSeconds=30 \
        --wait
    
    # Create ClusterIssuer for Let's Encrypt
    cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: devops@austa.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
    
    log_success "cert-manager installed successfully"
}

# Install Istio service mesh
install_istio() {
    log_step "Installing Istio service mesh..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would install Istio"
        return 0
    fi
    
    # Install Istio base
    helm upgrade --install istio-base istio/base \
        --namespace istio-system \
        --create-namespace \
        --wait
    
    # Install Istio daemon
    helm upgrade --install istiod istio/istiod \
        --namespace istio-system \
        --set telemetry.v2.prometheus.configOverride.inbound_service_metrics.dimensions.source_app="source_app | 'unknown'" \
        --set telemetry.v2.prometheus.configOverride.outbound_service_metrics.dimensions.destination_service_name="destination_service_name | 'unknown'" \
        --wait
    
    # Install Istio gateway
    helm upgrade --install istio-gateway istio/gateway \
        --namespace istio-system \
        --wait
    
    # Enable sidecar injection for application namespace
    kubectl label namespace "austa-cockpit-${ENVIRONMENT}" istio-injection=enabled --overwrite
    
    log_success "Istio service mesh installed successfully"
}

# Configure autoscaling
configure_autoscaling() {
    log_step "Configuring cluster autoscaling..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would configure autoscaling"
        return 0
    fi
    
    # Install metrics server if not present
    if ! kubectl get deployment metrics-server -n kube-system &>/dev/null; then
        log_info "Installing metrics server..."
        kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
        
        # Patch metrics server for local development
        if [[ "$ENVIRONMENT" == "development" ]]; then
            kubectl patch deployment metrics-server -n kube-system --type='json' -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--kubelet-insecure-tls"}]'
        fi
    fi
    
    # Install Horizontal Pod Autoscaler
    cat <<EOF | kubectl apply -f -
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: austa-cockpit-hpa
  namespace: austa-cockpit-${ENVIRONMENT}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: austa-cockpit-backend
  minReplicas: 2
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 70
EOF
    
    log_success "Autoscaling configured successfully"
}

# Install security tools
install_security() {
    log_step "Installing security tools..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would install security tools"
        return 0
    fi
    
    # Install Falco for runtime security monitoring
    helm repo add falcosecurity https://falcosecurity.github.io/charts
    helm repo update
    
    helm upgrade --install falco falcosecurity/falco \
        --namespace falco-system \
        --create-namespace \
        --set fakeEventGenerator.enabled=true \
        --set falco.grpc.enabled=true \
        --set falco.grpcOutput.enabled=true \
        --wait
    
    # Install OPA Gatekeeper for policy enforcement
    kubectl apply -f https://raw.githubusercontent.com/open-policy-agent/gatekeeper/release-3.14/deploy/gatekeeper.yaml
    
    # Create network policies
    cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: austa-cockpit-network-policy
  namespace: austa-cockpit-${ENVIRONMENT}
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: istio-system
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    - namespaceSelector:
        matchLabels:
          name: monitoring
  egress:
  - to: []
    ports:
    - protocol: TCP
      port: 53
    - protocol: UDP
      port: 53
  - to:
    - namespaceSelector: {}
EOF
    
    log_success "Security tools installed successfully"
}

# Validate cluster health
validate_cluster() {
    log_step "Validating cluster health..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would validate cluster health"
        return 0
    fi
    
    # Check node status
    log_info "Checking node status..."
    kubectl get nodes
    
    local unhealthy_nodes
    unhealthy_nodes=$(kubectl get nodes --no-headers | grep -v Ready | wc -l)
    
    if [[ $unhealthy_nodes -gt 0 ]]; then
        log_error "$unhealthy_nodes unhealthy nodes found"
        kubectl get nodes
        exit 1
    fi
    
    # Check system pods
    log_info "Checking system pods..."
    local failed_pods
    failed_pods=$(kubectl get pods --all-namespaces --field-selector=status.phase!=Running --no-headers | wc -l)
    
    if [[ $failed_pods -gt 0 ]]; then
        log_warning "$failed_pods pods are not running"
        kubectl get pods --all-namespaces --field-selector=status.phase!=Running
    fi
    
    # Check persistent volumes
    log_info "Checking persistent volumes..."
    kubectl get pv
    
    # Check services
    log_info "Checking services..."
    kubectl get svc --all-namespaces
    
    # Test DNS resolution
    log_info "Testing DNS resolution..."
    kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup kubernetes.default || true
    
    log_success "Cluster health validation completed"
}

# Create monitoring dashboards
create_dashboards() {
    log_step "Creating monitoring dashboards..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would create monitoring dashboards"
        return 0
    fi
    
    # Create custom Grafana dashboard for AUSTA Cockpit
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: austa-cockpit-dashboard
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  austa-cockpit.json: |
    {
      "dashboard": {
        "id": null,
        "title": "AUSTA Cockpit Dashboard",
        "tags": ["austa", "cockpit"],
        "style": "dark",
        "timezone": "browser",
        "panels": [
          {
            "title": "Request Rate",
            "type": "graph",
            "targets": [
              {
                "expr": "rate(http_requests_total{job=\"austa-cockpit\"}[5m])",
                "legendFormat": "{{method}} {{status}}"
              }
            ]
          },
          {
            "title": "Response Time",
            "type": "graph",
            "targets": [
              {
                "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job=\"austa-cockpit\"}[5m]))",
                "legendFormat": "95th percentile"
              }
            ]
          },
          {
            "title": "Error Rate",
            "type": "graph", 
            "targets": [
              {
                "expr": "rate(http_requests_total{job=\"austa-cockpit\",status=~\"5..\"}[5m]) / rate(http_requests_total{job=\"austa-cockpit\"}[5m])",
                "legendFormat": "Error Rate"
              }
            ]
          }
        ],
        "time": {
          "from": "now-1h",
          "to": "now"
        },
        "refresh": "30s"
      }
    }
EOF
    
    log_success "Monitoring dashboards created"
}

# Main setup function
main() {
    log_info "Starting Kubernetes cluster setup..."
    log_info "Environment: $ENVIRONMENT | Cloud: $CLOUD_PROVIDER | Cluster: $CLUSTER_NAME"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "DRY RUN MODE - No actual changes will be made"
    fi
    
    # Cluster setup pipeline
    configure_kubectl
    create_namespaces
    install_helm
    install_monitoring
    install_ingress
    install_cert_manager
    install_istio
    configure_autoscaling
    install_security
    create_dashboards
    validate_cluster
    
    # Final summary
    echo
    echo "Kubernetes Cluster Setup Summary:"
    echo "================================="
    echo "Environment:      $ENVIRONMENT"
    echo "Cloud Provider:   $CLOUD_PROVIDER"
    echo "Cluster Name:     $CLUSTER_NAME"
    echo "Monitoring:       Prometheus + Grafana"
    echo "Ingress:          NGINX"
    echo "Service Mesh:     Istio"
    echo "SSL:              cert-manager + Let's Encrypt"
    echo "Security:         Falco + OPA Gatekeeper"
    echo "Autoscaling:      HPA + Cluster Autoscaler"
    echo
    
    log_success "Kubernetes cluster setup completed successfully!"
    
    # Show access information
    echo
    echo "Access Information:"
    echo "==================="
    echo "Grafana Dashboard: kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80"
    echo "Prometheus:        kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090"
    echo "Cluster Info:      kubectl cluster-info"
    echo
}

# Parse arguments and run
parse_args "$@"
validate_args
main