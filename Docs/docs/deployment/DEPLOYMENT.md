# Production Deployment Guide

This guide covers the complete deployment process for AUSTA Cockpit in production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Database Deployment](#database-deployment)
4. [Application Deployment](#application-deployment)
5. [Kubernetes Configuration](#kubernetes-configuration)
6. [CI/CD Pipeline](#cicd-pipeline)
7. [Monitoring Setup](#monitoring-setup)
8. [Security Configuration](#security-configuration)
9. [Backup and Recovery](#backup-and-recovery)
10. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

- **kubectl** v1.28+
- **helm** v3.12+
- **terraform** v1.5+
- **docker** v24.0+
- **aws-cli** v2 (if using AWS)
- **gcloud** SDK (if using GCP)
- **azure-cli** (if using Azure)

### Access Requirements

- Kubernetes cluster admin access
- Cloud provider credentials
- Domain name and SSL certificates
- Container registry access
- Secrets management system

## Infrastructure Setup

### 1. Cloud Provider Setup (AWS Example)

```bash
# Set up AWS credentials
export AWS_PROFILE=austa-production
export AWS_REGION=us-east-1

# Create infrastructure with Terraform
cd infrastructure/terraform/aws
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

**Terraform Configuration** (`main.tf`):
```hcl
provider "aws" {
  region = var.aws_region
}

# VPC Configuration
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  
  name = "austa-cockpit-vpc"
  cidr = "10.0.0.0/16"
  
  azs             = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  
  enable_nat_gateway = true
  enable_vpn_gateway = true
  enable_dns_hostnames = true
  
  tags = {
    Environment = "production"
    Application = "austa-cockpit"
  }
}

# EKS Cluster
module "eks" {
  source = "terraform-aws-modules/eks/aws"
  
  cluster_name    = "austa-cockpit-eks"
  cluster_version = "1.28"
  
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets
  
  eks_managed_node_groups = {
    general = {
      min_size     = 3
      max_size     = 10
      desired_size = 5
      
      instance_types = ["t3.xlarge"]
      
      k8s_labels = {
        Environment = "production"
        NodeType    = "general"
      }
    }
    
    compute = {
      min_size     = 2
      max_size     = 8
      desired_size = 3
      
      instance_types = ["c5.2xlarge"]
      
      k8s_labels = {
        Environment = "production"
        NodeType    = "compute"
      }
      
      taints = [{
        key    = "compute"
        value  = "true"
        effect = "NO_SCHEDULE"
      }]
    }
  }
}

# RDS PostgreSQL
resource "aws_db_instance" "postgres" {
  identifier = "austa-cockpit-postgres"
  
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.r5.2xlarge"
  
  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_encrypted     = true
  storage_type         = "gp3"
  
  db_name  = "austa_cockpit"
  username = "austa_admin"
  password = var.db_password  # From AWS Secrets Manager
  
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name
  
  backup_retention_period = 30
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  multi_az               = true
  deletion_protection    = true
  skip_final_snapshot    = false
  
  enabled_cloudwatch_logs_exports = ["postgresql"]
  
  tags = {
    Environment = "production"
    Application = "austa-cockpit"
  }
}

# ElastiCache Redis
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "austa-cockpit-redis"
  replication_group_description = "Redis for AUSTA Cockpit"
  
  engine               = "redis"
  engine_version       = "7.0"
  node_type           = "cache.r6g.xlarge"
  number_cache_clusters = 3
  
  port = 6379
  
  subnet_group_name = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]
  
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token_enabled        = true
  auth_token                = var.redis_auth_token
  
  automatic_failover_enabled = true
  multi_az_enabled          = true
  
  snapshot_retention_limit = 7
  snapshot_window         = "03:00-05:00"
  
  tags = {
    Environment = "production"
    Application = "austa-cockpit"
  }
}

# S3 Buckets
resource "aws_s3_bucket" "assets" {
  bucket = "austa-cockpit-assets-prod"
  
  tags = {
    Environment = "production"
    Application = "austa-cockpit"
  }
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
```

### 2. Container Registry Setup

```bash
# AWS ECR
aws ecr create-repository --repository-name austa/cockpit-frontend
aws ecr create-repository --repository-name austa/cockpit-backend
aws ecr create-repository --repository-name austa/cockpit-ai-service

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REGISTRY
```

## Database Deployment

### 1. Database Migration

```bash
# Connect to production database
export DATABASE_URL="postgresql://austa_admin:$DB_PASSWORD@$DB_HOST:5432/austa_cockpit?sslmode=require"

# Run migrations
cd backend
npm run migrate:prod

# Verify migrations
psql $DATABASE_URL -c "SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"
```

### 2. Database Optimization

```sql
-- Create indexes for performance
CREATE INDEX CONCURRENTLY idx_cases_status_created ON cases(status, created_at DESC);
CREATE INDEX CONCURRENTLY idx_cases_assigned_priority ON cases(assigned_to, priority) WHERE status = 'pending';
CREATE INDEX CONCURRENTLY idx_decisions_case_created ON decisions(case_id, created_at DESC);
CREATE INDEX CONCURRENTLY idx_audit_logs_user_timestamp ON audit_logs(user_id, timestamp DESC);

-- Partition large tables
CREATE TABLE audit_logs_2024_01 PARTITION OF audit_logs
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Analyze tables for query optimizer
ANALYZE cases;
ANALYZE decisions;
ANALYZE users;
```

### 3. Read Replica Setup

```bash
# Create read replica in different AZ
aws rds create-db-instance-read-replica \
  --db-instance-identifier austa-cockpit-postgres-read-1 \
  --source-db-instance-identifier austa-cockpit-postgres \
  --availability-zone us-east-1b
```

## Application Deployment

### 1. Build and Push Images

```bash
# Build images
docker build -t $ECR_REGISTRY/austa/cockpit-frontend:$VERSION -f Dockerfile.frontend .
docker build -t $ECR_REGISTRY/austa/cockpit-backend:$VERSION -f Dockerfile.backend .
docker build -t $ECR_REGISTRY/austa/cockpit-ai-service:$VERSION -f Dockerfile.ai-service .

# Push to registry
docker push $ECR_REGISTRY/austa/cockpit-frontend:$VERSION
docker push $ECR_REGISTRY/austa/cockpit-backend:$VERSION
docker push $ECR_REGISTRY/austa/cockpit-ai-service:$VERSION
```

### 2. Helm Chart Configuration

```yaml
# values-production.yaml
global:
  environment: production
  domain: cockpit.austa.com.br
  
frontend:
  replicaCount: 3
  image:
    repository: 123456789.dkr.ecr.us-east-1.amazonaws.com/austa/cockpit-frontend
    tag: v1.0.0
  
  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 1Gi
  
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 20
    targetCPUUtilizationPercentage: 70
    targetMemoryUtilizationPercentage: 80

backend:
  replicaCount: 5
  image:
    repository: 123456789.dkr.ecr.us-east-1.amazonaws.com/austa/cockpit-backend
    tag: v1.0.0
  
  resources:
    requests:
      cpu: 1000m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 2Gi
  
  env:
    - name: NODE_ENV
      value: production
    - name: DATABASE_URL
      valueFrom:
        secretKeyRef:
          name: db-credentials
          key: url
    - name: REDIS_URL
      valueFrom:
        secretKeyRef:
          name: redis-credentials
          key: url

aiService:
  replicaCount: 3
  image:
    repository: 123456789.dkr.ecr.us-east-1.amazonaws.com/austa/cockpit-ai-service
    tag: v1.0.0
  
  resources:
    requests:
      cpu: 2000m
      memory: 4Gi
    limits:
      cpu: 4000m
      memory: 8Gi
  
  nodeSelector:
    NodeType: compute
  
  tolerations:
    - key: compute
      operator: Equal
      value: "true"
      effect: NoSchedule

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
  hosts:
    - host: cockpit.austa.com.br
      paths:
        - path: /
          pathType: Prefix
          backend:
            service:
              name: frontend
              port:
                number: 80
        - path: /api
          pathType: Prefix
          backend:
            service:
              name: backend
              port:
                number: 3000
  tls:
    - secretName: cockpit-tls
      hosts:
        - cockpit.austa.com.br

postgresql:
  enabled: false  # Using RDS
  
redis:
  enabled: false  # Using ElastiCache
```

### 3. Deploy with Helm

```bash
# Add Helm repository
helm repo add austa https://charts.austa.com.br
helm repo update

# Install/Upgrade
helm upgrade --install austa-cockpit austa/cockpit \
  -f values-production.yaml \
  --namespace austa-system \
  --create-namespace \
  --wait
```

## Kubernetes Configuration

### 1. Namespace and RBAC

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: austa-system
  labels:
    name: austa-system
    environment: production

---
# rbac.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: austa-system
  name: austa-cockpit-role
rules:
- apiGroups: [""]
  resources: ["pods", "services", "configmaps", "secrets"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets"]
  verbs: ["get", "list", "watch"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: austa-cockpit-rolebinding
  namespace: austa-system
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: austa-cockpit-role
subjects:
- kind: ServiceAccount
  name: austa-cockpit-sa
  namespace: austa-system
```

### 2. ConfigMaps and Secrets

```bash
# Create secrets
kubectl create secret generic db-credentials \
  --from-literal=url="postgresql://user:pass@host:5432/db?sslmode=require" \
  -n austa-system

kubectl create secret generic redis-credentials \
  --from-literal=url="redis://user:pass@redis-cluster:6379" \
  -n austa-system

kubectl create secret generic api-keys \
  --from-literal=openai-key="sk-..." \
  --from-literal=jwt-secret="..." \
  -n austa-system
```

### 3. Network Policies

```yaml
# network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-network-policy
  namespace: austa-system
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: austa-system
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: austa-system
  - to:
    - podSelector: {}
    ports:
    - protocol: TCP
      port: 5432  # PostgreSQL
    - protocol: TCP
      port: 6379  # Redis
  - to:
    - podSelector: {}
    ports:
    - protocol: TCP
      port: 53   # DNS
    - protocol: UDP
      port: 53
```

### 4. Pod Disruption Budgets

```yaml
# pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: backend-pdb
  namespace: austa-system
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: backend

---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: frontend-pdb
  namespace: austa-system
spec:
  maxUnavailable: 1
  selector:
    matchLabels:
      app: frontend
```

## CI/CD Pipeline

### 1. GitHub Actions Workflow

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  push:
    tags:
      - 'v*'

env:
  ECR_REGISTRY: ${{ secrets.ECR_REGISTRY }}
  EKS_CLUSTER_NAME: austa-cockpit-eks
  AWS_REGION: us-east-1

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test
        
      - name: Run E2E tests
        run: npm run test:e2e
        
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Trivy security scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'CRITICAL,HIGH'
          
      - name: Run Snyk security scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
          
  build-and-push:
    needs: [test, security-scan]
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [frontend, backend, ai-service]
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
          
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1
        
      - name: Build and push image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.ref_name }}
        run: |
          docker build -t $ECR_REGISTRY/austa/cockpit-${{ matrix.service }}:$IMAGE_TAG \
            -f Dockerfile.${{ matrix.service }} .
          docker push $ECR_REGISTRY/austa/cockpit-${{ matrix.service }}:$IMAGE_TAG
          
  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
          
      - name: Update kubeconfig
        run: |
          aws eks update-kubeconfig --name ${{ env.EKS_CLUSTER_NAME }} --region ${{ env.AWS_REGION }}
          
      - name: Deploy to Kubernetes
        run: |
          helm upgrade --install austa-cockpit ./helm/cockpit \
            -f helm/cockpit/values-production.yaml \
            --set global.imageTag=${{ github.ref_name }} \
            --namespace austa-system \
            --wait
            
      - name: Verify deployment
        run: |
          kubectl rollout status deployment/frontend -n austa-system
          kubectl rollout status deployment/backend -n austa-system
          kubectl rollout status deployment/ai-service -n austa-system
          
      - name: Run smoke tests
        run: |
          npm run test:smoke -- --env=production
```

### 2. GitLab CI Pipeline

```yaml
# .gitlab-ci.yml
stages:
  - test
  - build
  - deploy
  - verify

variables:
  DOCKER_DRIVER: overlay2
  DOCKER_TLS_CERTDIR: ""
  
test:
  stage: test
  image: node:20
  script:
    - npm ci
    - npm test
    - npm run test:e2e
  coverage: '/Lines\s*:\s*(\d+\.\d+)%/'
  
security-scan:
  stage: test
  image: aquasec/trivy:latest
  script:
    - trivy fs --severity HIGH,CRITICAL .
    
build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - docker build -t $CI_REGISTRY_IMAGE/frontend:$CI_COMMIT_TAG -f Dockerfile.frontend .
    - docker build -t $CI_REGISTRY_IMAGE/backend:$CI_COMMIT_TAG -f Dockerfile.backend .
    - docker build -t $CI_REGISTRY_IMAGE/ai-service:$CI_COMMIT_TAG -f Dockerfile.ai-service .
    - docker push $CI_REGISTRY_IMAGE/frontend:$CI_COMMIT_TAG
    - docker push $CI_REGISTRY_IMAGE/backend:$CI_COMMIT_TAG
    - docker push $CI_REGISTRY_IMAGE/ai-service:$CI_COMMIT_TAG
  only:
    - tags
    
deploy:
  stage: deploy
  image: alpine/helm:latest
  before_script:
    - apk add --no-cache aws-cli
    - aws eks update-kubeconfig --name $EKS_CLUSTER_NAME --region $AWS_REGION
  script:
    - helm upgrade --install austa-cockpit ./helm/cockpit
        -f helm/cockpit/values-production.yaml
        --set global.imageTag=$CI_COMMIT_TAG
        --namespace austa-system
        --wait
  environment:
    name: production
    url: https://cockpit.austa.com.br
  only:
    - tags
    
verify:
  stage: verify
  image: node:20
  script:
    - npm run test:smoke -- --env=production
  only:
    - tags
```

## Monitoring Setup

### 1. Prometheus Configuration

```yaml
# prometheus-values.yaml
prometheus:
  prometheusSpec:
    retention: 30d
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: gp3
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 100Gi
    
    serviceMonitorSelectorNilUsesHelmValues: false
    podMonitorSelectorNilUsesHelmValues: false
    
    additionalScrapeConfigs:
    - job_name: 'kubernetes-pods'
      kubernetes_sd_configs:
      - role: pod
      relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)

grafana:
  enabled: true
  adminPassword: $GRAFANA_PASSWORD
  persistence:
    enabled: true
    size: 10Gi
  
  dashboardProviders:
    dashboardproviders.yaml:
      apiVersion: 1
      providers:
      - name: 'default'
        orgId: 1
        folder: ''
        type: file
        disableDeletion: false
        editable: true
        options:
          path: /var/lib/grafana/dashboards/default

alertmanager:
  config:
    global:
      resolve_timeout: 5m
      slack_api_url: $SLACK_WEBHOOK_URL
    
    route:
      group_by: ['alertname', 'cluster', 'service']
      group_wait: 10s
      group_interval: 10s
      repeat_interval: 12h
      receiver: 'default'
      routes:
      - match:
          severity: critical
        receiver: pagerduty
      - match:
          severity: warning
        receiver: slack
    
    receivers:
    - name: 'default'
      slack_configs:
      - channel: '#alerts'
        title: 'AUSTA Cockpit Alert'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
```

### 2. Application Metrics

```typescript
// backend/src/metrics.ts
import { register, Counter, Histogram, Gauge } from 'prom-client';

// Business metrics
export const casesProcessed = new Counter({
  name: 'austa_cases_processed_total',
  help: 'Total number of cases processed',
  labelNames: ['status', 'priority']
});

export const decisionTime = new Histogram({
  name: 'austa_decision_time_seconds',
  help: 'Time taken to make audit decisions',
  labelNames: ['decision_type'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600]
});

export const aiConfidence = new Gauge({
  name: 'austa_ai_confidence_score',
  help: 'AI confidence score for decisions',
  labelNames: ['model']
});

// Technical metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]
});

// Middleware
export const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || 'unknown', res.statusCode.toString())
      .observe(duration);
  });
  
  next();
};
```

### 3. Alerts Configuration

```yaml
# alerts.yaml
groups:
- name: austa-cockpit
  interval: 30s
  rules:
  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: High error rate detected
      description: "Error rate is {{ $value }} errors per second"
      
  - alert: HighResponseTime
    expr: histogram_quantile(0.95, http_request_duration_seconds) > 2
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: High response time
      description: "95th percentile response time is {{ $value }} seconds"
      
  - alert: LowAIConfidence
    expr: austa_ai_confidence_score < 0.7
    for: 15m
    labels:
      severity: warning
    annotations:
      summary: Low AI confidence scores
      description: "AI confidence is {{ $value }}"
      
  - alert: DatabaseConnectionPoolExhausted
    expr: pg_stat_database_numbackends / pg_settings_max_connections > 0.8
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: Database connection pool nearly exhausted
      description: "{{ $value | humanizePercentage }} of connections in use"
```

## Security Configuration

### 1. SSL/TLS Setup

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: devops@austa.com.br
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

### 2. Security Policies

```yaml
# pod-security-policy.yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: restricted
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
    - ALL
  volumes:
    - 'configMap'
    - 'emptyDir'
    - 'projected'
    - 'secret'
    - 'downwardAPI'
    - 'persistentVolumeClaim'
  hostNetwork: false
  hostIPC: false
  hostPID: false
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'RunAsAny'
  supplementalGroups:
    rule: 'RunAsAny'
  fsGroup:
    rule: 'RunAsAny'
  readOnlyRootFilesystem: true
```

### 3. Secrets Management

```bash
# Install Sealed Secrets
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# Create sealed secret
echo -n "mypassword" | kubectl create secret generic db-password \
  --dry-run=client \
  --from-file=password=/dev/stdin \
  -o yaml | kubeseal -o yaml > sealed-db-password.yaml

# Apply sealed secret
kubectl apply -f sealed-db-password.yaml
```

## Backup and Recovery

### 1. Database Backup

```bash
# Automated backup script
#!/bin/bash
# backup-database.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="austa_cockpit_backup_${DATE}.sql"

# Backup database
pg_dump $DATABASE_URL > /tmp/$BACKUP_FILE

# Compress backup
gzip /tmp/$BACKUP_FILE

# Upload to S3
aws s3 cp /tmp/${BACKUP_FILE}.gz s3://austa-backups/postgres/${BACKUP_FILE}.gz

# Verify backup
aws s3 ls s3://austa-backups/postgres/${BACKUP_FILE}.gz

# Clean up old backups (keep 30 days)
aws s3 ls s3://austa-backups/postgres/ | while read -r line;
do
  createDate=$(echo $line | awk '{print $1" "$2}')
  createDate=$(date -d "$createDate" +%s)
  olderThan=$(date -d "30 days ago" +%s)
  if [[ $createDate -lt $olderThan ]]
  then
    fileName=$(echo $line | awk '{print $4}')
    aws s3 rm s3://austa-backups/postgres/$fileName
  fi
done
```

### 2. Application State Backup

```yaml
# velero backup configuration
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: daily-backup
  namespace: velero
spec:
  schedule: "0 2 * * *"  # 2 AM daily
  template:
    ttl: 720h  # 30 days
    includedNamespaces:
    - austa-system
    storageLocation: default
    volumeSnapshotLocations:
    - default
```

### 3. Disaster Recovery Plan

```bash
# Restore from backup
#!/bin/bash
# restore-system.sh

# 1. Restore database
LATEST_BACKUP=$(aws s3 ls s3://austa-backups/postgres/ | sort | tail -n 1 | awk '{print $4}')
aws s3 cp s3://austa-backups/postgres/$LATEST_BACKUP /tmp/
gunzip /tmp/$LATEST_BACKUP
psql $DATABASE_URL < /tmp/${LATEST_BACKUP%.gz}

# 2. Restore Kubernetes resources
velero restore create --from-backup daily-backup-20240126020000

# 3. Verify services
kubectl get pods -n austa-system
kubectl get svc -n austa-system

# 4. Run health checks
./scripts/health-check.sh
```

## Troubleshooting

### Common Issues

#### 1. Pod CrashLoopBackOff
```bash
# Check pod logs
kubectl logs -n austa-system <pod-name> --previous

# Describe pod for events
kubectl describe pod -n austa-system <pod-name>

# Check resource limits
kubectl top pod -n austa-system <pod-name>
```

#### 2. Database Connection Issues
```bash
# Test database connectivity
kubectl run -it --rm debug --image=postgres:15 --restart=Never -- \
  psql "postgresql://user:pass@host:5432/db?sslmode=require" -c "SELECT 1"

# Check connection pool
kubectl exec -n austa-system <backend-pod> -- \
  node -e "require('./src/db').pool.query('SELECT count(*) FROM pg_stat_activity')"
```

#### 3. High Memory Usage
```bash
# Check memory usage
kubectl top nodes
kubectl top pods -n austa-system --sort-by=memory

# Get heap dump
kubectl exec -n austa-system <pod-name> -- \
  kill -USR2 1  # Triggers heap dump in Node.js
```

#### 4. Slow API Response
```bash
# Check response times
kubectl exec -n austa-system <backend-pod> -- \
  curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/health

# Enable debug logging
kubectl set env deployment/backend -n austa-system DEBUG=express:*
```

### Performance Tuning

#### 1. Database Optimization
```sql
-- Update statistics
ANALYZE;

-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan;
```

#### 2. Application Optimization
```bash
# Enable Node.js profiling
kubectl set env deployment/backend -n austa-system \
  NODE_OPTIONS="--inspect=0.0.0.0:9229"

# Port forward for debugging
kubectl port-forward -n austa-system <pod-name> 9229:9229

# Connect Chrome DevTools to chrome://inspect
```

### Monitoring Queries

```promql
# Useful Prometheus queries

# Request rate
sum(rate(http_requests_total[5m])) by (service)

# Error rate
sum(rate(http_requests_total{status=~"5.."}[5m])) by (service) / sum(rate(http_requests_total[5m])) by (service)

# Response time percentiles
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))

# Memory usage
container_memory_usage_bytes{namespace="austa-system"} / container_spec_memory_limit_bytes

# CPU usage
rate(container_cpu_usage_seconds_total{namespace="austa-system"}[5m])
```

## Post-Deployment Checklist

- [ ] All pods are running and healthy
- [ ] Ingress is accessible and SSL works
- [ ] Database connections are stable
- [ ] Redis cache is operational
- [ ] AI models are loaded and responding
- [ ] Monitoring dashboards show data
- [ ] Alerts are configured and tested
- [ ] Backup jobs are scheduled
- [ ] Security scans pass
- [ ] Load tests meet SLA requirements
- [ ] Documentation is updated
- [ ] Team is notified of deployment

## Rollback Procedure

```bash
# Quick rollback
helm rollback austa-cockpit -n austa-system

# Rollback to specific revision
helm rollback austa-cockpit 5 -n austa-system

# Verify rollback
helm status austa-cockpit -n austa-system
kubectl get pods -n austa-system
```

## Support

For deployment issues:
- **Slack**: #austa-ops
- **Email**: devops@austa.com.br
- **On-call**: +55 11 9999-9999