#!/bin/bash

# AUSTA Cockpit Monitoring Stack Startup Script
# This script initializes and starts the complete monitoring and observability stack

set -e

echo "🚀 Starting AUSTA Cockpit Monitoring Stack..."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    print_status "Checking Docker status..."
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    print_success "Docker is running"
}

# Check if Docker Compose is available
check_docker_compose() {
    print_status "Checking Docker Compose..."
    if ! command -v docker-compose >/dev/null 2>&1; then
        print_error "Docker Compose is not installed. Please install Docker Compose and try again."
        exit 1
    fi
    print_success "Docker Compose is available"
}

# Create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    
    directories=(
        "logs"
        "data/prometheus"
        "data/grafana"
        "data/elasticsearch"
        "data/alertmanager"
    )
    
    for dir in "${directories[@]}"; do
        mkdir -p "$dir"
        print_status "Created directory: $dir"
    done
    
    print_success "All directories created"
}

# Set proper permissions
set_permissions() {
    print_status "Setting proper permissions..."
    
    # Elasticsearch needs specific UID
    sudo chown -R 1000:1000 data/elasticsearch 2>/dev/null || {
        print_warning "Could not set Elasticsearch permissions. You may need to run with sudo."
    }
    
    # Grafana needs specific UID
    sudo chown -R 472:472 data/grafana 2>/dev/null || {
        print_warning "Could not set Grafana permissions. You may need to run with sudo."
    }
    
    print_success "Permissions set"
}

# Wait for service to be ready
wait_for_service() {
    local service_name=$1
    local url=$2
    local max_attempts=${3:-30}
    local attempt=1
    
    print_status "Waiting for $service_name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" >/dev/null 2>&1; then
            print_success "$service_name is ready"
            return 0
        fi
        
        printf "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_error "$service_name failed to start within expected time"
    return 1
}

# Start the monitoring stack
start_stack() {
    print_status "Starting monitoring stack..."
    
    # Pull latest images
    print_status "Pulling latest images..."
    docker-compose -f docker-compose.monitoring.yml pull
    
    # Start services in order
    print_status "Starting core services..."
    docker-compose -f docker-compose.monitoring.yml up -d \
        elasticsearch \
        prometheus \
        alertmanager
    
    # Wait for core services
    wait_for_service "Elasticsearch" "http://localhost:9200/_cluster/health"
    wait_for_service "Prometheus" "http://localhost:9090/-/ready"
    wait_for_service "AlertManager" "http://localhost:9093/-/ready"
    
    # Start remaining services
    print_status "Starting remaining services..."
    docker-compose -f docker-compose.monitoring.yml up -d
    
    # Wait for all services
    wait_for_service "Grafana" "http://localhost:3001/api/health"
    wait_for_service "Kibana" "http://localhost:5601/api/status"
    wait_for_service "Jaeger" "http://localhost:16686/"
    wait_for_service "Logstash" "http://localhost:9600/"
    
    print_success "All services started successfully"
}

# Verify service health
verify_services() {
    print_status "Verifying service health..."
    
    services=(
        "Prometheus:http://localhost:9090/api/v1/targets"
        "Grafana:http://localhost:3001/api/health"
        "AlertManager:http://localhost:9093/api/v1/status"
        "Elasticsearch:http://localhost:9200/_cluster/health"
        "Kibana:http://localhost:5601/api/status"
        "Jaeger:http://localhost:16686/api/services"
    )
    
    for service_info in "${services[@]}"; do
        service_name=$(echo "$service_info" | cut -d: -f1)
        service_url=$(echo "$service_info" | cut -d: -f2-)
        
        if curl -s -f "$service_url" >/dev/null 2>&1; then
            print_success "$service_name is healthy"
        else
            print_warning "$service_name may not be fully ready"
        fi
    done
}

# Setup Grafana datasources and dashboards
setup_grafana() {
    print_status "Setting up Grafana..."
    
    # Wait a bit more for Grafana to be fully ready
    sleep 10
    
    # Check if datasources are already configured
    datasources_count=$(curl -s -u admin:austa_monitoring_2024 \
        "http://localhost:3001/api/datasources" | jq length 2>/dev/null || echo "0")
    
    if [ "$datasources_count" -gt 1 ]; then
        print_success "Grafana datasources already configured"
    else
        print_warning "Grafana datasources may need manual configuration"
        print_status "Visit http://localhost:3001 with admin/austa_monitoring_2024"
    fi
}

# Create Elasticsearch index templates
setup_elasticsearch() {
    print_status "Setting up Elasticsearch index templates..."
    
    # Wait for Elasticsearch to be fully ready
    sleep 5
    
    # Create index template for logs
    if curl -s -X PUT "http://localhost:9200/_index_template/austa-logs" \
        -H "Content-Type: application/json" \
        -d @logstash/templates/austa-logs-template.json >/dev/null 2>&1; then
        print_success "Elasticsearch index template created"
    else
        print_warning "Could not create Elasticsearch index template"
    fi
}

# Display access URLs
show_access_info() {
    echo ""
    echo "📊 AUSTA Cockpit Monitoring Stack is ready!"
    echo ""
    echo "🔗 Access URLs:"
    echo "   Grafana (Dashboards):     http://localhost:3001 (admin/austa_monitoring_2024)"
    echo "   Prometheus (Metrics):     http://localhost:9090"
    echo "   AlertManager (Alerts):    http://localhost:9093"
    echo "   Kibana (Logs):           http://localhost:5601"
    echo "   Jaeger (Tracing):        http://localhost:16686"
    echo "   Elasticsearch:           http://localhost:9200"
    echo ""
    echo "📈 Key Dashboards:"
    echo "   Executive Overview:       http://localhost:3001/d/austa-executive"
    echo "   Technical Operations:     http://localhost:3001/d/austa-technical"
    echo ""
    echo "🔧 Management Commands:"
    echo "   Stop all services:        docker-compose -f docker-compose.monitoring.yml down"
    echo "   View logs:               docker-compose -f docker-compose.monitoring.yml logs -f [service]"
    echo "   Restart service:         docker-compose -f docker-compose.monitoring.yml restart [service]"
    echo ""
    echo "📚 Documentation:"
    echo "   Monitoring Guide:         ./README.md"
    echo "   Incident Response:        ./runbooks/incident-response.md"
    echo ""
}

# Handle script arguments
case "$1" in
    "stop")
        print_status "Stopping monitoring stack..."
        docker-compose -f docker-compose.monitoring.yml down
        print_success "Monitoring stack stopped"
        exit 0
        ;;
    "restart")
        print_status "Restarting monitoring stack..."
        docker-compose -f docker-compose.monitoring.yml down
        sleep 5
        $0  # Re-run the script
        exit 0
        ;;
    "status")
        print_status "Checking monitoring stack status..."
        docker-compose -f docker-compose.monitoring.yml ps
        verify_services
        exit 0
        ;;
    "logs")
        service=${2:-""}
        if [ -n "$service" ]; then
            docker-compose -f docker-compose.monitoring.yml logs -f "$service"
        else
            docker-compose -f docker-compose.monitoring.yml logs -f
        fi
        exit 0
        ;;
    "help"|"-h"|"--help")
        echo "AUSTA Cockpit Monitoring Stack Management"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  (no args)  Start the monitoring stack"
        echo "  stop       Stop all monitoring services"
        echo "  restart    Restart the monitoring stack"
        echo "  status     Show status of all services"
        echo "  logs       Show logs for all services"
        echo "  logs <svc> Show logs for specific service"
        echo "  help       Show this help message"
        echo ""
        exit 0
        ;;
esac

# Main execution
main() {
    echo "🏥 AUSTA Cockpit - Monitoring & Observability Stack"
    echo "=================================================="
    echo ""
    
    check_docker
    check_docker_compose
    create_directories
    set_permissions
    start_stack
    verify_services
    setup_grafana
    setup_elasticsearch
    show_access_info
}

# Run main function
main "$@"