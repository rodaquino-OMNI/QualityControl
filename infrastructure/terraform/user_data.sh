#!/bin/bash

# AUSTA Cockpit EC2 User Data Script
# This script initializes EC2 instances for the AUSTA Cockpit application

set -e

# Configuration from Terraform template
ENVIRONMENT="${environment}"
PROJECT_NAME="${project_name}"
DOCKER_COMPOSE_URL="${docker_compose_url}"
S3_BUCKET="${s3_bucket}"

# Logging setup
LOG_FILE="/var/log/user-data.log"
exec > >(tee -a $LOG_FILE)
exec 2>&1

echo "================================================"
echo "AUSTA Cockpit EC2 Initialization Started"
echo "Timestamp: $(date)"
echo "Environment: $ENVIRONMENT"
echo "Project: $PROJECT_NAME"
echo "================================================"

# Update system packages
echo "Updating system packages..."
yum update -y

# Install required packages
echo "Installing required packages..."
yum install -y \
    docker \
    git \
    curl \
    wget \
    unzip \
    jq \
    htop \
    vim \
    awscli \
    amazon-cloudwatch-agent

# Install Docker Compose
echo "Installing Docker Compose..."
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose

# Start and enable Docker
echo "Starting Docker service..."
systemctl start docker
systemctl enable docker

# Add ec2-user to docker group
usermod -a -G docker ec2-user

# Create application directories
echo "Creating application directories..."
mkdir -p /app
mkdir -p /app/logs
mkdir -p /app/backups
mkdir -p /app/uploads
mkdir -p /app/configs
mkdir -p /var/log/austa

# Set proper permissions
chown -R ec2-user:ec2-user /app
chmod -R 755 /app

# Download application configuration
echo "Downloading application configuration..."
cd /app

# Download docker-compose file
if [ ! -z "$DOCKER_COMPOSE_URL" ]; then
    curl -L "$DOCKER_COMPOSE_URL" -o docker-compose.yml
else
    echo "Warning: No docker-compose URL provided"
fi

# Download backup scripts from S3
echo "Downloading backup scripts from S3..."
if [ ! -z "$S3_BUCKET" ]; then
    aws s3 sync "s3://$S3_BUCKET/scripts/" /app/scripts/ || echo "Warning: Could not download scripts from S3"
    aws s3 sync "s3://$S3_BUCKET/configs/" /app/configs/ || echo "Warning: Could not download configs from S3"
    
    # Make scripts executable
    chmod +x /app/scripts/*.sh 2>/dev/null || true
fi

# Configure environment variables
echo "Configuring environment variables..."
cat > /app/.env << EOF
# AUSTA Cockpit Environment Configuration
NODE_ENV=$ENVIRONMENT
PROJECT_NAME=$PROJECT_NAME
AWS_REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
S3_BUCKET=$S3_BUCKET

# Docker configuration
COMPOSE_PROJECT_NAME=austa-cockpit
COMPOSE_FILE=docker-compose.yml

# Logging
LOG_DRIVER=awslogs
LOG_GROUP=/aws/austa/$ENVIRONMENT/application

# Health checks
HEALTH_CHECK_INTERVAL=30s
HEALTH_CHECK_TIMEOUT=10s
HEALTH_CHECK_RETRIES=3

# Backup configuration
BACKUP_RETENTION_DAYS=30
BACKUP_S3_BUCKET=$S3_BUCKET
CROSS_REGION_BACKUP=true

# Monitoring
ENABLE_CLOUDWATCH_METRICS=true
CLOUDWATCH_NAMESPACE=AUSTA/$ENVIRONMENT
EOF

# Create systemd service for AUSTA Cockpit
echo "Creating systemd service..."
cat > /etc/systemd/system/austa-cockpit.service << EOF
[Unit]
Description=AUSTA Cockpit Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/app
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
ExecReload=/usr/local/bin/docker-compose restart
TimeoutStartSec=300
User=ec2-user
Group=ec2-user
Environment=HOME=/home/ec2-user

[Install]
WantedBy=multi-user.target
EOF

# Create log rotation configuration
echo "Configuring log rotation..."
cat > /etc/logrotate.d/austa-cockpit << EOF
/var/log/austa/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    su ec2-user ec2-user
}

/app/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    su ec2-user ec2-user
}
EOF

# Configure CloudWatch Agent
echo "Configuring CloudWatch Agent..."
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << EOF
{
    "agent": {
        "metrics_collection_interval": 60,
        "run_as_user": "cwagent"
    },
    "logs": {
        "logs_collected": {
            "files": {
                "collect_list": [
                    {
                        "file_path": "/var/log/austa/*.log",
                        "log_group_name": "/aws/austa/$ENVIRONMENT/application",
                        "log_stream_name": "{instance_id}/application",
                        "timezone": "UTC"
                    },
                    {
                        "file_path": "/app/logs/*.log",
                        "log_group_name": "/aws/austa/$ENVIRONMENT/application",
                        "log_stream_name": "{instance_id}/docker",
                        "timezone": "UTC"
                    },
                    {
                        "file_path": "/var/log/user-data.log",
                        "log_group_name": "/aws/austa/$ENVIRONMENT/infrastructure",
                        "log_stream_name": "{instance_id}/user-data",
                        "timezone": "UTC"
                    }
                ]
            }
        }
    },
    "metrics": {
        "namespace": "AUSTA/$ENVIRONMENT",
        "metrics_collected": {
            "cpu": {
                "measurement": [
                    "cpu_usage_idle",
                    "cpu_usage_iowait",
                    "cpu_usage_user",
                    "cpu_usage_system"
                ],
                "metrics_collection_interval": 60
            },
            "disk": {
                "measurement": [
                    "used_percent"
                ],
                "metrics_collection_interval": 60,
                "resources": [
                    "*"
                ]
            },
            "diskio": {
                "measurement": [
                    "io_time"
                ],
                "metrics_collection_interval": 60,
                "resources": [
                    "*"
                ]
            },
            "mem": {
                "measurement": [
                    "mem_used_percent"
                ],
                "metrics_collection_interval": 60
            },
            "netstat": {
                "measurement": [
                    "tcp_established",
                    "tcp_time_wait"
                ],
                "metrics_collection_interval": 60
            },
            "swap": {
                "measurement": [
                    "swap_used_percent"
                ],
                "metrics_collection_interval": 60
            }
        }
    }
}
EOF

# Start CloudWatch Agent
echo "Starting CloudWatch Agent..."
systemctl enable amazon-cloudwatch-agent
systemctl start amazon-cloudwatch-agent

# Create health check script
echo "Creating health check script..."
cat > /app/health-check.sh << 'EOF'
#!/bin/bash

# AUSTA Cockpit Health Check Script
set -e

HEALTH_STATUS=0
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Starting health check..."

# Check if Docker is running
if ! systemctl is-active --quiet docker; then
    echo "[$TIMESTAMP] ERROR: Docker service is not running"
    HEALTH_STATUS=1
fi

# Check if docker-compose services are running
if [ -f /app/docker-compose.yml ]; then
    cd /app
    
    # Check if containers are running
    if ! docker-compose ps | grep -q "Up"; then
        echo "[$TIMESTAMP] WARNING: Some containers may not be running"
        docker-compose ps
    fi
    
    # Check application health endpoints
    if curl -f http://localhost:3000/health >/dev/null 2>&1; then
        echo "[$TIMESTAMP] Frontend health check: PASS"
    else
        echo "[$TIMESTAMP] Frontend health check: FAIL"
        HEALTH_STATUS=1
    fi
    
    if curl -f http://localhost:3001/health >/dev/null 2>&1; then
        echo "[$TIMESTAMP] Backend health check: PASS"
    else
        echo "[$TIMESTAMP] Backend health check: FAIL"
        HEALTH_STATUS=1
    fi
else
    echo "[$TIMESTAMP] WARNING: docker-compose.yml not found"
    HEALTH_STATUS=1
fi

# Check disk space
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 85 ]; then
    echo "[$TIMESTAMP] WARNING: High disk usage: ${DISK_USAGE}%"
fi

# Check memory usage
MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
if [ "$MEMORY_USAGE" -gt 85 ]; then
    echo "[$TIMESTAMP] WARNING: High memory usage: ${MEMORY_USAGE}%"
fi

# Send metrics to CloudWatch
if command -v aws >/dev/null 2>&1; then
    aws cloudwatch put-metric-data \
        --namespace "AUSTA/$ENVIRONMENT" \
        --metric-data MetricName=HealthCheckStatus,Value=$HEALTH_STATUS,Unit=Count \
        --region $(curl -s http://169.254.169.254/latest/meta-data/placement/region) || true
        
    aws cloudwatch put-metric-data \
        --namespace "AUSTA/$ENVIRONMENT" \
        --metric-data MetricName=DiskUsagePercent,Value=$DISK_USAGE,Unit=Percent \
        --region $(curl -s http://169.254.169.254/latest/meta-data/placement/region) || true
        
    aws cloudwatch put-metric-data \
        --namespace "AUSTA/$ENVIRONMENT" \
        --metric-data MetricName=MemoryUsagePercent,Value=$MEMORY_USAGE,Unit=Percent \
        --region $(curl -s http://169.254.169.254/latest/meta-data/placement/region) || true
fi

echo "[$TIMESTAMP] Health check completed with status: $HEALTH_STATUS"
exit $HEALTH_STATUS
EOF

chmod +x /app/health-check.sh

# Create cron job for health checks
echo "Setting up cron jobs..."
cat > /tmp/austa-cron << EOF
# AUSTA Cockpit Cron Jobs
*/5 * * * * /app/health-check.sh >> /var/log/austa/health-check.log 2>&1
0 2 * * * /app/scripts/backup-all.sh >> /var/log/austa/backup.log 2>&1
0 */6 * * * /app/scripts/cross-region-replication.sh intelligent >> /var/log/austa/replication.log 2>&1
EOF

# Install cron jobs for ec2-user
su - ec2-user -c "crontab /tmp/austa-cron"
rm /tmp/austa-cron

# Create startup script
echo "Creating startup script..."
cat > /app/startup.sh << 'EOF'
#!/bin/bash

# AUSTA Cockpit Startup Script
set -e

echo "Starting AUSTA Cockpit..."

# Change to application directory
cd /app

# Load environment variables
if [ -f .env ]; then
    source .env
fi

# Pull latest images
echo "Pulling latest Docker images..."
docker-compose pull

# Start services
echo "Starting services..."
docker-compose up -d

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 30

# Run health check
echo "Running initial health check..."
./health-check.sh

echo "AUSTA Cockpit startup completed successfully"
EOF

chmod +x /app/startup.sh

# Download and restore latest backup if in DR mode
if [ "$ENVIRONMENT" = "dr" ]; then
    echo "DR mode detected, attempting to restore from latest backup..."
    if [ -f /app/scripts/restore-all.sh ]; then
        /app/scripts/restore-all.sh --latest || echo "Warning: Could not restore from backup"
    fi
fi

# Enable and start the service
echo "Enabling AUSTA Cockpit service..."
systemctl daemon-reload
systemctl enable austa-cockpit

# Start the application (unless in DR mode where we restored from backup)
if [ "$ENVIRONMENT" != "dr" ]; then
    echo "Starting AUSTA Cockpit application..."
    su - ec2-user -c "cd /app && ./startup.sh"
fi

# Configure automatic security updates
echo "Configuring automatic security updates..."
yum install -y yum-cron
systemctl enable yum-cron
systemctl start yum-cron

# Set up log shipping
echo "Configuring log shipping..."
cat > /etc/rsyslog.d/49-austa.conf << EOF
# AUSTA Cockpit log shipping
\$WorkDirectory /var/lib/rsyslog
\$ActionQueueFileName austa_fwd
\$ActionQueueMaxDiskSpace 1g
\$ActionQueueSaveOnShutdown on
\$ActionQueueType LinkedList
\$ActionResumeRetryCount -1

# Ship application logs to CloudWatch via rsyslog
*.info @@localhost:514
EOF

systemctl restart rsyslog

# Create final status report
echo "Creating deployment status report..."
cat > /app/deployment-status.json << EOF
{
    "deployment_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "environment": "$ENVIRONMENT",
    "project_name": "$PROJECT_NAME",
    "instance_id": "$(curl -s http://169.254.169.254/latest/meta-data/instance-id)",
    "instance_type": "$(curl -s http://169.254.169.254/latest/meta-data/instance-type)",
    "availability_zone": "$(curl -s http://169.254.169.254/latest/meta-data/placement/availability-zone)",
    "region": "$(curl -s http://169.254.169.254/latest/meta-data/placement/region)",
    "docker_version": "$(docker --version)",
    "docker_compose_version": "$(docker-compose --version)",
    "services_configured": [
        "docker",
        "cloudwatch-agent",
        "austa-cockpit",
        "health-monitoring",
        "log-shipping",
        "backup-automation"
    ],
    "status": "completed"
}
EOF

# Upload status report to S3
if [ ! -z "$S3_BUCKET" ]; then
    aws s3 cp /app/deployment-status.json "s3://$S3_BUCKET/deployments/$(curl -s http://169.254.169.254/latest/meta-data/instance-id)/deployment-status.json" || echo "Warning: Could not upload status report"
fi

# Signal successful completion
echo "================================================"
echo "AUSTA Cockpit EC2 Initialization Completed"
echo "Timestamp: $(date)"
echo "Status: SUCCESS"
echo "================================================"

# Send CloudWatch metric for successful initialization
aws cloudwatch put-metric-data \
    --namespace "AUSTA/$ENVIRONMENT" \
    --metric-data MetricName=InstanceInitialization,Value=1,Unit=Count \
    --region $(curl -s http://169.254.169.254/latest/meta-data/placement/region) || true

# Final reboot to ensure all services start properly
if [ "$ENVIRONMENT" != "dr" ]; then
    echo "Scheduling reboot in 1 minute to ensure clean startup..."
    shutdown -r +1 "Rebooting to complete AUSTA Cockpit initialization"
fi