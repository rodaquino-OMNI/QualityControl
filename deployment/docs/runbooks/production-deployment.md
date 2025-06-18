# Production Deployment Runbook

## Overview

This runbook provides step-by-step procedures for deploying AUSTA Cockpit to production environments safely and efficiently.

## Prerequisites

### Required Tools
- Docker 20.0+
- kubectl 1.28+
- Helm 3.0+
- Terraform 1.0+
- AWS CLI v2 (for AWS deployments)
- Git
- jq (for JSON processing)

### Access Requirements
- AWS/GCP/Azure CLI configured with appropriate permissions
- Kubernetes cluster access
- Docker registry access
- Terraform state storage access
- Secrets management system access

### Environment Preparation
- [ ] Verify all required tools are installed
- [ ] Confirm access to target environment
- [ ] Check deployment permissions
- [ ] Validate configuration files
- [ ] Ensure backup procedures are in place

## Pre-Deployment Checklist

### Code and Configuration
- [ ] Code review completed and approved
- [ ] All tests passing (unit, integration, E2E)
- [ ] Security scan completed
- [ ] Configuration validated for target environment
- [ ] Database migration scripts reviewed
- [ ] Rollback plan prepared

### Infrastructure
- [ ] Kubernetes cluster health verified
- [ ] Resource capacity checked
- [ ] Database connectivity confirmed
- [ ] Monitoring systems operational
- [ ] Load balancer health verified
- [ ] SSL certificates valid

### Team Readiness
- [ ] Deployment team notified
- [ ] On-call engineer available
- [ ] Stakeholders informed
- [ ] Rollback procedures reviewed
- [ ] Communication channels ready

## Deployment Procedures

### 1. Infrastructure Deployment

#### 1.1 Terraform Infrastructure
```bash
# Navigate to terraform directory
cd deployment/infrastructure/terraform

# Initialize Terraform
terraform init

# Plan infrastructure changes
terraform plan -var-file="environments/production.tfvars" -out=production.plan

# Review plan output carefully
# Apply infrastructure changes
terraform apply production.plan
```

#### 1.2 Verify Infrastructure
```bash
# Check cluster status
kubectl cluster-info

# Verify nodes are ready
kubectl get nodes

# Check system pods
kubectl get pods --all-namespaces
```

### 2. Database Migrations

#### 2.1 Create Database Backup
```bash
# Create backup before migrations
./deployment/scripts/database/migrate.sh backup production
```

#### 2.2 Run Migrations
```bash
# Run database migrations
./deployment/scripts/database/migrate.sh migrate production --backup-before

# Verify migration status
./deployment/scripts/database/migrate.sh status production
```

### 3. Application Deployment

#### 3.1 Configuration Management
```bash
# Validate configuration
./deployment/config/config-manager.sh validate production

# Sync secrets (if using external secrets manager)
./deployment/config/config-manager.sh sync production
```

#### 3.2 Canary Deployment
```bash
# Deploy with canary strategy (recommended for production)
./deployment/scripts/deploy.sh \
  --environment production \
  --strategy canary \
  --version v1.2.3 \
  --approval-required \
  --backup-before
```

#### 3.3 Monitor Deployment
```bash
# Watch deployment progress
kubectl rollout status deployment/austa-cockpit-canary -n austa-cockpit-production

# Monitor logs
kubectl logs -f deployment/austa-cockpit-canary -n austa-cockpit-production --all-containers=true
```

### 4. Post-Deployment Validation

#### 4.1 Health Checks
```bash
# Run comprehensive health checks
./deployment/validation/health-checks/service-health.sh production --detailed

# Verify all services are running
kubectl get pods -n austa-cockpit-production
```

#### 4.2 Smoke Tests
```bash
# Run smoke tests
./deployment/validation/smoke-tests/smoke-test.sh production --verbose

# Test critical user journeys
./deployment/validation/e2e-tests/critical-path.sh production
```

#### 4.3 Performance Validation
```bash
# Run performance tests
./deployment/validation/performance-tests/performance-test.sh production

# Check response times and throughput
./deployment/monitoring/performance-check.sh production
```

## Monitoring and Alerting

### 1. Key Metrics to Monitor

#### Application Metrics
- Request rate and response times
- Error rates and HTTP status codes
- Database connection pool status
- AI model inference latencies
- User authentication success rates

#### Infrastructure Metrics
- CPU and memory utilization
- Disk space and I/O
- Network throughput
- Pod restart counts
- Kubernetes resource usage

#### Business Metrics
- User login rates
- Case processing throughput
- Fraud detection accuracy
- System availability

### 2. Monitoring Commands
```bash
# Check Prometheus metrics
kubectl port-forward -n monitoring svc/prometheus-server 9090:80

# Access Grafana dashboards
kubectl port-forward -n monitoring svc/grafana 3000:80

# View application logs
kubectl logs -f deployment/austa-cockpit-stable -n austa-cockpit-production --all-containers=true
```

### 3. Alert Thresholds

#### Critical Alerts
- Application downtime > 1 minute
- Error rate > 5%
- Response time > 2 seconds (95th percentile)
- Database connectivity failures
- Pod crash loops

#### Warning Alerts
- CPU usage > 70%
- Memory usage > 80%
- Disk space > 85%
- Certificate expiry < 30 days
- Backup failures

## Rollback Procedures

### 1. Immediate Rollback (Emergency)
```bash
# Emergency rollback to previous version
./deployment/scripts/rollback.sh \
  --environment production \
  --strategy immediate \
  --reason "Critical production issue"
```

### 2. Gradual Rollback (Canary)
```bash
# Gradual rollback through canary reduction
./deployment/scripts/rollback.sh \
  --environment production \
  --strategy canary \
  --percentage 0
```

### 3. Database Rollback
```bash
# Restore database from backup (if necessary)
./deployment/scripts/database/migrate.sh restore production /path/to/backup.tar.gz

# Rollback specific migrations
./deployment/scripts/database/migrate.sh rollback production 3
```

## Troubleshooting Guide

### Common Issues

#### 1. Pod Startup Failures
```bash
# Check pod status and events
kubectl describe pod <pod-name> -n austa-cockpit-production

# Check logs for errors
kubectl logs <pod-name> -n austa-cockpit-production --previous

# Check resource constraints
kubectl top pods -n austa-cockpit-production
```

#### 2. Database Connection Issues
```bash
# Test database connectivity
kubectl run postgres-test --image=postgres:15 --rm -i --restart=Never \
  -- pg_isready -h <db-host> -p 5432

# Check database logs
kubectl logs -f deployment/postgres -n database

# Verify secrets
kubectl get secret db-credentials -n austa-cockpit-production -o yaml
```

#### 3. Load Balancer Issues
```bash
# Check load balancer status
kubectl get svc -n austa-cockpit-production

# Check ingress configuration
kubectl describe ingress austa-cockpit -n austa-cockpit-production

# Test external connectivity
curl -I https://austa-cockpit.com/health
```

#### 4. SSL Certificate Issues
```bash
# Check certificate status
kubectl get certificates -n austa-cockpit-production

# Check cert-manager logs
kubectl logs -f deployment/cert-manager -n cert-manager

# Manually renew certificate
kubectl delete certificate austa-cockpit-tls -n austa-cockpit-production
```

### Performance Issues

#### 1. High Response Times
- Check database query performance
- Verify adequate resource allocation
- Review application caching
- Analyze AI model performance

#### 2. Memory Leaks
- Monitor memory usage trends
- Check for resource cleanup
- Review application logs for errors
- Consider pod restart if necessary

#### 3. Database Performance
- Check connection pool settings
- Review slow query logs
- Verify index optimization
- Monitor database metrics

## Security Considerations

### 1. Access Control
- Ensure RBAC policies are in place
- Verify service account permissions
- Check network policies
- Review API authentication

### 2. Secrets Management
- Rotate secrets regularly
- Use encrypted storage
- Limit secret access
- Monitor secret usage

### 3. Network Security
- Verify firewall rules
- Check TLS configuration
- Review ingress policies
- Monitor network traffic

## Compliance and Auditing

### 1. Audit Trail
- All deployment activities are logged
- Configuration changes are tracked
- Database modifications are recorded
- Access attempts are monitored

### 2. Compliance Checks
```bash
# Run compliance validation
./deployment/validation/compliance/compliance-check.sh production

# Generate audit report
./deployment/reporting/audit-report.sh production
```

## Communication Procedures

### 1. Pre-Deployment
- Notify stakeholders 24 hours in advance
- Send deployment plan to team
- Confirm on-call coverage
- Schedule deployment window

### 2. During Deployment
- Post status updates in deployment channel
- Monitor for issues continuously
- Keep stakeholders informed
- Document any deviations

### 3. Post-Deployment
- Send completion notification
- Share validation results
- Document lessons learned
- Update runbook if needed

## Emergency Contacts

### Production Support Team
- DevOps Engineer: +1-XXX-XXX-XXXX
- SRE Team Lead: +1-XXX-XXX-XXXX
- Database Administrator: +1-XXX-XXX-XXXX
- Security Team: +1-XXX-XXX-XXXX

### Escalation Procedures
1. Technical issues → DevOps Engineer
2. Database issues → Database Administrator
3. Security concerns → Security Team
4. Business impact → Product Manager

## Recovery Time Objectives

### Service Level Objectives
- **Availability**: 99.9% uptime
- **Recovery Time Objective (RTO)**: 4 hours
- **Recovery Point Objective (RPO)**: 1 hour
- **Mean Time to Recovery (MTTR)**: 30 minutes

### Backup and Recovery
- Database backups: Every 6 hours
- Configuration backups: Every deployment
- Log retention: 90 days
- Backup testing: Monthly

## Appendix

### A. Environment Variables
Refer to `deployment/config/production.yaml` for all environment-specific variables.

### B. Resource Limits
Production resource allocation per service:
- Frontend: 2 CPU, 4GB RAM
- Backend: 4 CPU, 8GB RAM  
- AI Service: 8 CPU, 16GB RAM
- Database: 16 CPU, 64GB RAM

### C. Useful Commands
```bash
# Quick status check
kubectl get pods,svc,ingress -n austa-cockpit-production

# Resource usage
kubectl top pods -n austa-cockpit-production

# Recent events
kubectl get events -n austa-cockpit-production --sort-by=.metadata.creationTimestamp

# Pod logs (all containers)
kubectl logs -f deployment/austa-cockpit-stable -n austa-cockpit-production --all-containers=true

# Database connection test
kubectl run db-test --image=postgres:15 --rm -i --restart=Never \
  --env="PGPASSWORD=$DB_PASSWORD" \
  -- psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1;"
```

---

**Document Version**: 1.0  
**Last Updated**: $(date)  
**Next Review**: $(date -d "+3 months")  
**Owner**: DevOps Team