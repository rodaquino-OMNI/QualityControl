# AUSTA Cockpit - Monitoring & Observability Stack

## Overview

This directory contains the complete monitoring and observability stack for AUSTA Cockpit, providing comprehensive insights into system performance, business metrics, security events, and operational health.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Applications  │────│    Prometheus    │────│    Grafana      │
│  (Backend/AI)   │    │  (Metrics Store) │    │ (Visualization) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                       │
         │              ┌──────────────────┐              │
         │──────────────│  AlertManager    │──────────────│
         │              │   (Alerting)     │              │
         │              └──────────────────┘              │
         │                                                │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│    Logstash     │────│  Elasticsearch   │────│     Kibana      │
│ (Log Processing)│    │  (Log Storage)    │    │ (Log Analysis)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                                                │
         └────────────────────┬───────────────────────────┘
                             │
                    ┌─────────────────┐
                    │     Jaeger      │
                    │ (Dist. Tracing) │
                    └─────────────────┘
```

## Components

### 1. Metrics Collection (Prometheus)
- **Purpose**: Collect and store time-series metrics
- **Port**: 9090
- **Config**: `prometheus/prometheus.yml`
- **Retention**: 15 days (configurable)
- **Scrape Interval**: 15s

### 2. Visualization (Grafana)
- **Purpose**: Create dashboards and visualizations
- **Port**: 3001
- **Login**: admin / austa_monitoring_2024
- **Dashboards**: Pre-configured for different stakeholders

### 3. Alerting (AlertManager)
- **Purpose**: Handle alerts from Prometheus
- **Port**: 9093
- **Config**: `alertmanager/alertmanager.yml`
- **Channels**: Email, Slack, PagerDuty

### 4. Log Management (ELK Stack)
- **Elasticsearch**: Log storage and search (Port: 9200)
- **Logstash**: Log processing and enrichment (Port: 5044)
- **Kibana**: Log visualization and analysis (Port: 5601)

### 5. Distributed Tracing (Jaeger)
- **Purpose**: Track requests across microservices
- **Port**: 16686
- **Storage**: In-memory (production should use persistent storage)

### 6. System Metrics
- **Node Exporter**: System metrics (Port: 9100)
- **cAdvisor**: Container metrics (Port: 8080)
- **Redis Exporter**: Redis metrics (Port: 9121)
- **Postgres Exporter**: Database metrics (Port: 9187)

## Quick Start

### 1. Start Monitoring Stack
```bash
cd monitoring
docker-compose -f docker-compose.monitoring.yml up -d
```

### 2. Verify Services
```bash
# Check all services are running
docker-compose -f docker-compose.monitoring.yml ps

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check Grafana (login: admin/austa_monitoring_2024)
open http://localhost:3001

# Check Kibana
open http://localhost:5601

# Check Jaeger
open http://localhost:16686
```

### 3. View Metrics
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001
- **AlertManager**: http://localhost:9093
- **Kibana**: http://localhost:5601
- **Jaeger**: http://localhost:16686

## Dashboards

### Executive Overview (`/d/austa-executive`)
- **Audience**: C-level executives, business stakeholders
- **Metrics**: 
  - Request rate trends
  - System availability
  - Business KPIs (case processing, AI accuracy)
  - High-level security incidents
- **Refresh**: 30s

### Technical Operations (`/d/austa-technical`)
- **Audience**: DevOps, SRE, technical teams
- **Metrics**:
  - Response time percentiles
  - Error rates by service
  - Resource utilization (CPU, memory, disk)
  - Network I/O
- **Refresh**: 10s

### Security Dashboard
- **Audience**: Security team, CISO
- **Metrics**:
  - Failed login attempts
  - Suspicious activity alerts
  - Unauthorized access attempts
  - Security event trends

### Business Intelligence Dashboard
- **Audience**: Business analysts, product managers
- **Metrics**:
  - Case processing volumes
  - AI model performance
  - Fraud detection accuracy
  - Operational efficiency metrics

## Alert Configuration

### Alert Severity Levels

1. **Critical**: Immediate action required
   - Service completely down
   - Data loss risk
   - Security breach
   - Response time: 5 minutes

2. **Warning**: Attention needed
   - Performance degradation
   - Resource exhaustion
   - Business metric anomalies
   - Response time: 30 minutes

3. **Info**: Awareness only
   - Maintenance notifications
   - Capacity planning alerts
   - Response time: 4 hours

### Notification Channels

#### Email
- **Critical**: critical-alerts@austa.com
- **Security**: security@austa.com
- **Business**: business@austa.com
- **Operations**: ops@austa.com

#### Slack
- **#austa-alerts-critical**: Critical system alerts
- **#austa-security**: Security events
- **#austa-ops**: Operational issues
- **#austa-business**: Business metrics

#### PagerDuty
- Critical alerts trigger PagerDuty escalation
- Integration key: Configure in `alertmanager.yml`

## Custom Metrics

### Application Metrics

#### Backend Service (`/metrics`)
```
# HTTP Request metrics
austa_http_requests_total{method,route,status_code,service}
austa_http_request_duration_seconds{method,route,status_code,service}

# Business metrics
austa_cases_processed_total{status,type}
austa_case_processing_duration_seconds{type,complexity}
austa_pending_cases_count{priority}
```

#### AI Service (`/metrics`)
```
# AI prediction metrics
austa_ai_predictions_total{model,task,status}
austa_ai_prediction_duration_seconds{model,task}
austa_ai_model_accuracy{model,task,dataset}
austa_ai_model_confidence{model,task}

# Fraud detection metrics
austa_fraud_detection_score{case_type,model}
```

### Security Metrics

```
# Authentication
austa_failed_login_attempts_total{ip_address,user_agent}
austa_unauthorized_api_requests_total{endpoint,ip_address}

# Threat detection
austa_suspicious_activity_score{user_id,activity_type}
```

## Log Structure

### Structured Logging Format
```json
{
  "@timestamp": "2024-01-01T12:00:00.000Z",
  "level": "INFO",
  "message": "User authentication successful",
  "service": "austa-backend",
  "environment": "production",
  "trace_id": "abc123...",
  "span_id": "def456...",
  "user_id": "user123",
  "event_type": "authentication",
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "response_time": 150
}
```

### Log Categories

1. **Application Logs**: General application events
2. **Security Logs**: Authentication, authorization, threats
3. **Performance Logs**: Response times, resource usage
4. **Business Logs**: Case processing, AI predictions
5. **Audit Logs**: User actions, data changes

## Maintenance

### Daily Tasks
- [ ] Check dashboard alerts
- [ ] Review error logs in Kibana
- [ ] Verify backup completion
- [ ] Monitor disk space usage

### Weekly Tasks
- [ ] Review alert fatigue metrics
- [ ] Update dashboard configurations
- [ ] Check log retention policies
- [ ] Performance trend analysis

### Monthly Tasks
- [ ] Review and update alert thresholds
- [ ] Capacity planning analysis
- [ ] Dashboard user feedback
- [ ] Security log analysis

## Troubleshooting

### Common Issues

#### Prometheus Not Scraping Targets
```bash
# Check target health
curl http://localhost:9090/api/v1/targets

# Check service accessibility
curl http://backend:8000/metrics
curl http://ai-service:8001/metrics

# Restart Prometheus
docker-compose -f docker-compose.monitoring.yml restart prometheus
```

#### Grafana Dashboard Not Loading
```bash
# Check Grafana logs
docker logs austa-grafana

# Restart Grafana
docker-compose -f docker-compose.monitoring.yml restart grafana

# Reset admin password
docker exec -it austa-grafana grafana-cli admin reset-admin-password admin
```

#### Elasticsearch Low Disk Space
```bash
# Check disk usage
curl http://localhost:9200/_cat/allocation?v

# Delete old indices
curl -X DELETE http://localhost:9200/austa-logs-2024.01.01

# Configure ILM policy
curl -X PUT http://localhost:9200/_ilm/policy/austa-logs-policy -H 'Content-Type: application/json' -d '{...}'
```

#### High Alert Volume (Alert Fatigue)
1. Review alert thresholds
2. Implement alert aggregation
3. Add alert dependencies
4. Use alert inhibition rules

### Performance Optimization

#### Prometheus
- Adjust scrape intervals based on need
- Use recording rules for complex queries
- Configure proper retention settings
- Enable compression for remote storage

#### Elasticsearch
- Optimize index templates
- Configure ILM policies
- Monitor heap usage
- Use appropriate shard sizing

#### Grafana
- Use dashboard caching
- Optimize query performance
- Limit time ranges for heavy queries
- Use dashboard variables effectively

## Security Considerations

### Access Control
- Use strong passwords for all services
- Enable HTTPS in production
- Implement proper network segmentation
- Regular security updates

### Data Privacy
- Sanitize sensitive data in logs
- Implement log access controls
- Use secure communication channels
- Regular security audits

### Monitoring the Monitors
- Set up monitoring for monitoring stack
- Health checks for all components
- Backup and recovery procedures
- Disaster recovery planning

## Contact & Support

- **Technical Issues**: ops@austa.com
- **Dashboard Requests**: analytics@austa.com
- **Security Concerns**: security@austa.com
- **Business Questions**: business@austa.com

## Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Elasticsearch Guide](https://www.elastic.co/guide/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [OpenTelemetry Specification](https://opentelemetry.io/docs/)