# AUSTA Cockpit CI/CD Pipeline Documentation

## Overview

This document describes the comprehensive CI/CD pipeline for AUSTA Cockpit, a healthcare quality control platform. The pipeline implements production-ready deployment with multi-stage validation, security scanning, blue-green deployment, and automated rollback capabilities.

## Architecture

### Components

1. **GitHub Actions Workflows** - Multi-stage pipeline orchestration
2. **Docker Registry** - Container image management (GitHub Container Registry)
3. **Kubernetes** - Container orchestration (Amazon EKS)
4. **Helm Charts** - Kubernetes deployment management
5. **Terraform** - Infrastructure as Code
6. **Sealed Secrets** - Secure secret management
7. **Monitoring Stack** - Prometheus & Grafana
8. **Blue-Green Deployment** - Zero-downtime production deployments

### Services

- **Frontend**: React.js application (TypeScript)
- **Backend**: Node.js API service (TypeScript)
- **AI Service**: Python FastAPI service
- **Database**: PostgreSQL with read replicas
- **Cache**: Redis with clustering
- **Logs**: MongoDB for audit logs

## Pipeline Stages

### 1. Test Stage (Parallel Execution)

#### Frontend Tests
- ESLint code quality checks
- TypeScript compilation verification
- Unit tests with Jest
- Coverage reporting
- Build verification

#### Backend Tests
- ESLint code quality checks
- TypeScript compilation verification
- Unit and integration tests
- Database migration validation
- Coverage reporting

#### AI Service Tests
- Python linting (flake8, black, isort)
- Type checking with mypy
- Unit and integration tests with pytest
- Coverage reporting

### 2. Security Scan Stage

- **Trivy** vulnerability scanning for containers and filesystems
- **npm audit** for Node.js dependencies
- **Bandit** for Python security issues
- **Safety** for Python dependency vulnerabilities
- SARIF report generation for GitHub Security tab

### 3. Build Stage (Docker Images)

- Multi-architecture builds (linux/amd64, linux/arm64)
- Image tagging strategy:
  - `latest` for main branch
  - `<branch>-<sha>` for feature branches
  - `v<version>` for semantic version tags
- SBOM (Software Bill of Materials) generation
- Image caching for faster builds

### 4. Database Migration Stage

- Automated Prisma migrations
- Schema validation
- Migration rollback preparation

### 5. Deployment Stages

#### Staging Deployment
- Automatic deployment on main branch pushes
- Reduced resource allocation
- Smoke testing
- Environment-specific configuration

#### Production Deployment
- Manual approval required
- Blue-green deployment strategy
- Full health checks
- Automatic rollback on failure

## Deployment Strategies

### Blue-Green Deployment

Production deployments use blue-green strategy for zero-downtime updates:

1. **Deploy Green Environment**: Deploy new version alongside current (blue)
2. **Health Checks**: Comprehensive testing of green environment
3. **Traffic Switch**: Update ingress to route traffic to green
4. **Verification**: Confirm green environment is handling traffic
5. **Cleanup**: Remove blue environment after successful verification

### Rollback Procedures

Automatic rollback triggers:
- Health check failures
- Error rate spikes
- Manual intervention

Rollback process:
1. Helm rollback to previous version
2. Database migration rollback (if needed)
3. Traffic verification
4. Notification to team

## Infrastructure as Code

### Terraform Components

- **VPC**: Multi-AZ network with public/private subnets
- **EKS Cluster**: Kubernetes cluster with managed node groups
- **RDS**: PostgreSQL with read replicas and automated backups
- **ElastiCache**: Redis with clustering and backup
- **Security Groups**: Network security configurations
- **IAM Roles**: Service accounts and permissions

### Resource Scaling

#### Staging Environment
- 2 frontend replicas
- 2 backend replicas
- 1 AI service replica
- Single-AZ database
- Basic monitoring

#### Production Environment
- 5+ frontend replicas with auto-scaling
- 5+ backend replicas with auto-scaling
- 3+ AI service replicas with auto-scaling
- Multi-AZ database with read replicas
- Comprehensive monitoring and alerting

## Security

### Secret Management

**Sealed Secrets Controller** encrypts secrets at rest:
- Database credentials
- API keys (Claude, OpenAI)
- JWT secrets
- Redis passwords
- Docker registry credentials

### Network Security

- **Network Policies**: Restrict pod-to-pod communication
- **Security Groups**: AWS-level network controls
- **TLS Encryption**: All inter-service communication
- **Pod Security Standards**: Enforce security contexts

### Image Security

- **Vulnerability Scanning**: All images scanned before deployment
- **Distroless Images**: Minimal attack surface
- **Non-root Users**: All containers run as non-root
- **Read-only Filesystems**: Prevent runtime modifications

## Monitoring and Alerting

### Metrics Collection

**Prometheus** collects metrics from:
- Kubernetes cluster components
- Application services
- Infrastructure components
- Custom business metrics

### Dashboards

**Grafana** provides visualization for:
- Request rates and error rates
- Response times and SLA metrics
- Resource utilization (CPU, memory, disk)
- Business KPIs

### Alerting Rules

Critical alerts:
- Pod crash loops
- High error rates
- Resource exhaustion
- Database connectivity issues
- Certificate expiration

## Usage Guide

### Manual Deployment

```bash
# Deploy to staging
./scripts/deploy.sh -e staging -t v1.2.3

# Deploy to production with blue-green
./scripts/deploy.sh -e production -t v1.2.3 --blue-green

# Rollback production
./scripts/deploy.sh -e production --rollback

# Dry run
./scripts/deploy.sh -e staging -t v1.2.3 --dry-run
```

### Environment Variables

Required secrets for deployment:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: JWT signing secret
- `CLAUDE_API_KEY`: Anthropic Claude API key
- `OPENAI_API_KEY`: OpenAI API key

### GitHub Repository Secrets

Required repository secrets:
- `KUBE_CONFIG_STAGING`: Kubeconfig for staging cluster
- `KUBE_CONFIG_PRODUCTION`: Kubeconfig for production cluster
- `SLACK_WEBHOOK`: Slack notification webhook
- `CODECOV_TOKEN`: Code coverage reporting token

## Disaster Recovery

### Backup Strategy

1. **Database Backups**: Daily automated backups with 30-day retention
2. **Application Data**: Persistent volume snapshots
3. **Configuration**: Git-based configuration management
4. **Secrets**: Backup of sealed secrets and encryption keys

### Recovery Procedures

1. **Infrastructure**: Terraform apply from state backup
2. **Database**: Point-in-time recovery from RDS snapshots
3. **Application**: Redeploy from Git tags
4. **Secrets**: Restore from sealed secrets backup

## Performance Optimizations

### Build Optimizations

- **Layer Caching**: Docker build cache optimization
- **Parallel Jobs**: Concurrent test execution
- **Dependency Caching**: NPM and pip cache strategies
- **Incremental Builds**: Only rebuild changed components

### Runtime Optimizations

- **Resource Requests/Limits**: Right-sized containers
- **HPA**: Horizontal Pod Autoscaling based on metrics
- **Node Affinity**: Optimal pod placement
- **PDB**: Pod Disruption Budgets for availability

## Maintenance

### Regular Tasks

- **Security Updates**: Monthly vulnerability patching
- **Dependency Updates**: Weekly dependency reviews
- **Certificate Renewal**: Automated with cert-manager
- **Backup Verification**: Monthly recovery testing

### Scaling Considerations

- **Database Scaling**: Read replicas and connection pooling
- **Cache Scaling**: Redis cluster expansion
- **Storage Scaling**: EBS volume expansion
- **Network Scaling**: Load balancer optimization

## Troubleshooting

### Common Issues

1. **Build Failures**: Check dependency versions and test failures
2. **Deployment Failures**: Verify resource limits and secrets
3. **Health Check Failures**: Check service connectivity and configuration
4. **Performance Issues**: Monitor resource utilization and scaling metrics

### Debug Commands

```bash
# Check pod status
kubectl get pods -n austa-cockpit-production

# View logs
kubectl logs -f deployment/austa-production-backend -n austa-cockpit-production

# Check events
kubectl get events -n austa-cockpit-production --sort-by='.lastTimestamp'

# Describe resources
kubectl describe deployment austa-production-frontend -n austa-cockpit-production
```

## Support and Contacts

- **DevOps Team**: devops@austa.com
- **Security Team**: security@austa.com
- **On-call**: Use PagerDuty integration for critical issues
- **Documentation**: This repository's docs/ folder

---

*This pipeline is designed for high availability, security, and scalability in healthcare environments. All changes should be reviewed and tested in staging before production deployment.*