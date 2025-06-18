#!/bin/bash

# AUSTA Cockpit Comprehensive Logging Setup Script
# This script sets up the complete logging and observability stack

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ELK_COMPOSE_FILE="docker/docker-compose.elk.yml"
MAIN_COMPOSE_FILE="docker-compose.yml"
LOGGING_NETWORK="austa-logging"

echo -e "${BLUE}🚀 AUSTA Cockpit Logging & Observability Setup${NC}"
echo "=================================================="

# Function to print status
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if Docker is running
check_docker() {
    echo "Checking Docker status..."
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    print_status "Docker is running"
}

# Check if Docker Compose is available
check_docker_compose() {
    echo "Checking Docker Compose..."
    if ! command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
        print_error "Docker Compose is not available. Please install it and try again."
        exit 1
    fi
    print_status "Docker Compose is available"
}

# Create logging network
create_logging_network() {
    echo "Creating logging network..."
    if docker network ls | grep -q "$LOGGING_NETWORK"; then
        print_warning "Network $LOGGING_NETWORK already exists"
    else
        docker network create "$LOGGING_NETWORK" --driver bridge --subnet 172.21.0.0/16
        print_status "Created network: $LOGGING_NETWORK"
    fi
}

# Create necessary directories
create_directories() {
    echo "Creating required directories..."
    
    # Log directories
    mkdir -p backend/logs
    mkdir -p ai-service/logs
    mkdir -p docker/elasticsearch/data
    mkdir -p docker/kibana/data
    mkdir -p docker/logstash/data
    mkdir -p docker/filebeat/data
    mkdir -p docker/metricbeat/data
    mkdir -p docker/curator/logs
    mkdir -p exports
    mkdir -p config
    
    # Set permissions
    chmod 755 backend/logs ai-service/logs exports config
    chmod 777 docker/elasticsearch/data docker/kibana/data docker/logstash/data
    chmod 777 docker/filebeat/data docker/metricbeat/data docker/curator/logs
    
    print_status "Created directories and set permissions"
}

# Install Node.js dependencies for enhanced logging
install_backend_dependencies() {
    echo "Installing backend logging dependencies..."
    
    if [ -f "backend/package.json" ]; then
        cd backend
        
        # Install additional logging dependencies
        npm install --save \
            winston-daily-rotate-file \
            winston-elasticsearch \
            @elastic/elasticsearch \
            @opentelemetry/api \
            @opentelemetry/sdk-node \
            @opentelemetry/resources \
            @opentelemetry/semantic-conventions \
            @opentelemetry/sdk-trace-base \
            @opentelemetry/exporter-jaeger \
            @opentelemetry/instrumentation-http \
            @opentelemetry/instrumentation-express
        
        cd ..
        print_status "Installed backend logging dependencies"
    else
        print_warning "Backend package.json not found, skipping dependency installation"
    fi
}

# Install Python dependencies for enhanced logging
install_ai_service_dependencies() {
    echo "Installing AI service logging dependencies..."
    
    if [ -f "ai-service/requirements.txt" ]; then
        # Add logging dependencies to requirements
        cat >> ai-service/requirements.txt << EOF

# Logging and Tracing Dependencies
python-json-logger>=2.0.7
structlog>=23.1.0
opentelemetry-api>=1.20.0
opentelemetry-sdk>=1.20.0
opentelemetry-exporter-jaeger>=1.20.0
opentelemetry-instrumentation-fastapi>=0.41b0
opentelemetry-instrumentation-requests>=0.41b0
opentelemetry-instrumentation-psycopg2>=0.41b0
opentelemetry-instrumentation-redis>=0.41b0
ecs-logging>=2.0.0
elasticsearch>=8.0.0
cryptography>=41.0.0
boto3>=1.28.0
azure-storage-blob>=12.17.0
EOF
        
        print_status "Added AI service logging dependencies to requirements.txt"
    else
        print_warning "AI service requirements.txt not found, skipping dependency installation"
    fi
}

# Start ELK Stack
start_elk_stack() {
    echo "Starting ELK Stack..."
    
    if [ -f "$ELK_COMPOSE_FILE" ]; then
        # Set required environment variables
        export ES_JAVA_OPTS="-Xms2g -Xmx2g"
        export ELASTIC_PASSWORD="austa123"
        
        # Start ELK stack services
        docker-compose -f "$ELK_COMPOSE_FILE" up -d
        
        print_status "ELK Stack started"
        
        # Wait for Elasticsearch to be healthy
        echo "Waiting for Elasticsearch to be ready..."
        timeout=300
        while [ $timeout -gt 0 ]; do
            if curl -s -u elastic:austa123 http://localhost:9200/_cluster/health >/dev/null 2>&1; then
                print_status "Elasticsearch is ready"
                break
            fi
            sleep 5
            timeout=$((timeout-5))
        done
        
        if [ $timeout -le 0 ]; then
            print_error "Elasticsearch failed to start within 5 minutes"
            exit 1
        fi
        
        # Wait for Kibana to be ready
        echo "Waiting for Kibana to be ready..."
        timeout=300
        while [ $timeout -gt 0 ]; do
            if curl -s http://localhost:5601/api/status >/dev/null 2>&1; then
                print_status "Kibana is ready"
                break
            fi
            sleep 5
            timeout=$((timeout-5))
        done
        
    else
        print_error "ELK compose file not found: $ELK_COMPOSE_FILE"
        exit 1
    fi
}

# Configure Elasticsearch indices and templates
configure_elasticsearch() {
    echo "Configuring Elasticsearch indices and templates..."
    
    # Create index templates
    curl -X PUT "localhost:9200/_index_template/austa-logs-template" \
        -u elastic:austa123 \
        -H "Content-Type: application/json" \
        -d '{
            "index_patterns": ["austa-*-logs-*"],
            "template": {
                "settings": {
                    "number_of_shards": 1,
                    "number_of_replicas": 0,
                    "index.refresh_interval": "5s"
                },
                "mappings": {
                    "properties": {
                        "@timestamp": {"type": "date"},
                        "level": {"type": "keyword"},
                        "message": {"type": "text"},
                        "service": {"type": "keyword"},
                        "environment": {"type": "keyword"},
                        "traceId": {"type": "keyword"},
                        "requestId": {"type": "keyword"},
                        "userId": {"type": "keyword"},
                        "ip": {"type": "ip"},
                        "responseTime": {"type": "integer"},
                        "statusCode": {"type": "integer"}
                    }
                }
            }
        }' >/dev/null 2>&1
    
    # Create ILM policy for log retention
    curl -X PUT "localhost:9200/_ilm/policy/austa-logs-policy" \
        -u elastic:austa123 \
        -H "Content-Type: application/json" \
        -d '{
            "policy": {
                "phases": {
                    "hot": {
                        "actions": {
                            "rollover": {
                                "max_size": "1GB",
                                "max_age": "1d"
                            }
                        }
                    },
                    "warm": {
                        "min_age": "7d",
                        "actions": {
                            "forcemerge": {
                                "max_num_segments": 1
                            }
                        }
                    },
                    "cold": {
                        "min_age": "30d"
                    },
                    "delete": {
                        "min_age": "90d"
                    }
                }
            }
        }' >/dev/null 2>&1
    
    print_status "Elasticsearch configuration completed"
}

# Import Kibana dashboards
import_kibana_dashboards() {
    echo "Importing Kibana dashboards..."
    
    if [ -f "docker/kibana/dashboards/austa-system-overview.json" ]; then
        # Wait a bit more for Kibana to be fully ready
        sleep 30
        
        # Import dashboard
        curl -X POST "localhost:5601/api/saved_objects/_import" \
            -u elastic:austa123 \
            -H "kbn-xsrf: true" \
            -H "Content-Type: application/json" \
            --form file=@docker/kibana/dashboards/austa-system-overview.json \
            >/dev/null 2>&1 || print_warning "Dashboard import may have failed, you can import manually"
        
        print_status "Kibana dashboards imported"
    else
        print_warning "Dashboard file not found, skipping import"
    fi
}

# Start monitoring services
start_monitoring() {
    echo "Starting monitoring services..."
    
    # Start Jaeger for distributed tracing
    docker-compose -f "$MAIN_COMPOSE_FILE" --profile monitoring up -d
    
    print_status "Monitoring services started"
}

# Configure log export script
setup_log_export() {
    echo "Setting up log export utilities..."
    
    # Make log export script executable
    if [ -f "scripts/log-export-compliance.py" ]; then
        chmod +x scripts/log-export-compliance.py
        
        # Create default configuration
        mkdir -p config
        cat > config/compliance-config.json << EOF
{
    "elasticsearch": {
        "host": "http://localhost:9200",
        "username": "elastic",
        "password": "austa123"
    },
    "export_directory": "./exports",
    "encryption_enabled": true,
    "compression_enabled": true,
    "cloud_storage": {
        "provider": "aws",
        "bucket": "austa-compliance-logs",
        "enabled": false
    },
    "retention_policies": {
        "security_logs": 2555,
        "audit_logs": 2555,
        "application_logs": 90,
        "error_logs": 365
    },
    "compliance_standards": ["SOX", "HIPAA", "GDPR", "PCI-DSS"]
}
EOF
        
        print_status "Log export utilities configured"
    fi
}

# Create cron job for automated log management
setup_automated_tasks() {
    echo "Setting up automated log management tasks..."
    
    # Create curator cron job
    cat > /tmp/austa-log-cron << 'EOF'
# AUSTA Log Management Tasks
# Run curator daily at 2 AM
0 2 * * * docker run --rm --network austa-logging -v $(pwd)/docker/curator:/usr/share/curator untergeek/curator:8.0.4 --config /usr/share/curator/config/curator.yml /usr/share/curator/actions/log-retention.yml

# Run log export weekly (Sundays at 3 AM)
0 3 * * 0 cd /path/to/austa && python3 scripts/log-export-compliance.py --start-date $(date -d '7 days ago' +%Y-%m-%d) --end-date $(date -d '1 day ago' +%Y-%m-%d)
EOF
    
    print_warning "Automated tasks configured in /tmp/austa-log-cron"
    print_warning "Please manually add these to your crontab with: crontab /tmp/austa-log-cron"
}

# Print access information
print_access_info() {
    echo
    echo -e "${BLUE}🎉 Logging & Observability Stack Setup Complete!${NC}"
    echo "=============================================="
    echo
    echo -e "${GREEN}Access URLs:${NC}"
    echo "  📊 Kibana Dashboard:    http://localhost:5601"
    echo "  🔍 Elasticsearch:       http://localhost:9200"
    echo "  📈 Jaeger Tracing:      http://localhost:16686"
    echo
    echo -e "${GREEN}Credentials:${NC}"
    echo "  Username: elastic"
    echo "  Password: austa123"
    echo
    echo -e "${GREEN}Log Files:${NC}"
    echo "  📁 Backend Logs:        ./backend/logs/"
    echo "  📁 AI Service Logs:     ./ai-service/logs/"
    echo "  📁 Exported Logs:       ./exports/"
    echo
    echo -e "${GREEN}Useful Commands:${NC}"
    echo "  View ELK services:      docker-compose -f $ELK_COMPOSE_FILE ps"
    echo "  View logs:              docker-compose -f $ELK_COMPOSE_FILE logs -f [service]"
    echo "  Stop ELK stack:         docker-compose -f $ELK_COMPOSE_FILE down"
    echo "  Export logs:            python3 scripts/log-export-compliance.py --help"
    echo
    echo -e "${YELLOW}Note:${NC} It may take a few minutes for all services to be fully operational."
    echo "      Check service health with the commands above."
}

# Main execution
main() {
    echo "Starting AUSTA logging setup..."
    
    check_docker
    check_docker_compose
    create_logging_network
    create_directories
    install_backend_dependencies
    install_ai_service_dependencies
    start_elk_stack
    configure_elasticsearch
    import_kibana_dashboards
    start_monitoring
    setup_log_export
    setup_automated_tasks
    print_access_info
    
    echo -e "${GREEN}✅ Setup completed successfully!${NC}"
}

# Run main function
main "$@"