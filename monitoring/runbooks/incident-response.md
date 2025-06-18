# AUSTA Cockpit - Incident Response Runbook

## Alert Severity Levels & Response Times

| Severity | Response Time | Escalation Time | Examples |
|----------|---------------|-----------------|----------|
| Critical | 5 minutes | 15 minutes | Service down, data loss, security breach |
| Warning | 30 minutes | 2 hours | Performance degradation, high error rates |
| Info | 4 hours | Next business day | Capacity warnings, maintenance needed |

## Critical Alerts Response

### Service Down Alert
**Alert**: `ServiceDown`
**Symptom**: `up == 0`

#### Immediate Actions (0-5 minutes)
1. **Acknowledge Alert**
   ```bash
   # Silence alert in AlertManager to prevent spam
   curl -X POST http://alertmanager:9093/api/v1/silences \
     -H "Content-Type: application/json" \
     -d '{
       "matchers": [{"name": "alertname", "value": "ServiceDown"}],
       "comment": "Investigating service outage",
       "createdBy": "oncall-engineer"
     }'
   ```

2. **Check Service Status**
   ```bash
   # Check if service is running
   docker ps | grep austa-backend
   docker ps | grep austa-ai-service
   
   # Check logs for errors
   docker logs austa-backend --tail 100
   docker logs austa-ai-service --tail 100
   ```

3. **Verify Network Connectivity**
   ```bash
   # Test internal connectivity
   curl -f http://backend:8000/health || echo "Backend unreachable"
   curl -f http://ai-service:8001/health || echo "AI service unreachable"
   
   # Check external connectivity
   curl -f http://localhost:8000/health || echo "External backend unreachable"
   ```

#### Investigation Actions (5-15 minutes)
4. **Check Infrastructure**
   ```bash
   # Check system resources
   docker stats --no-stream
   
   # Check disk space
   df -h
   
   # Check memory usage
   free -h
   
   # Check Docker daemon
   sudo systemctl status docker
   ```

5. **Review Recent Changes**
   ```bash
   # Check recent deployments
   docker image ls | head -10
   
   # Check Git history
   git log --oneline -10
   
   # Check environment variables
   docker exec austa-backend env | grep -E "(DATABASE|REDIS|AI_SERVICE)"
   ```

#### Recovery Actions
6. **Service Recovery**
   ```bash
   # Restart specific service
   docker-compose restart backend
   docker-compose restart ai-service
   
   # If container won't start, rebuild
   docker-compose build backend
   docker-compose up -d backend
   
   # Check health after restart
   sleep 30
   curl http://localhost:8000/health
   ```

7. **Database Recovery**
   ```bash
   # Check database connectivity
   docker exec austa-backend npm run db:check
   
   # Check PostgreSQL status
   docker logs postgres --tail 50
   
   # If database is down
   docker-compose restart postgres
   ```

#### Escalation
- **15 minutes**: If service not restored, escalate to senior engineer
- **30 minutes**: Engage database administrator
- **45 minutes**: Notify management and prepare customer communication

### High Error Rate Alert
**Alert**: `HighErrorRate`
**Symptom**: Error rate > 5% for 2 minutes

#### Immediate Actions
1. **Check Error Details**
   ```bash
   # View recent errors in logs
   docker logs austa-backend --tail 200 | grep ERROR
   
   # Check error patterns in Kibana
   curl "http://kibana:5601/api/saved_objects/_find?type=index-pattern" | jq
   ```

2. **Identify Error Sources**
   ```bash
   # Check HTTP error codes
   curl http://prometheus:9090/api/v1/query?query=rate(http_requests_total[5m]) | jq
   
   # Check specific endpoints
   curl http://prometheus:9090/api/v1/query?query=rate(http_requests_total{status=~"5.."}[5m])
   ```

3. **Quick Mitigation**
   ```bash
   # Check if specific endpoints are causing issues
   # Temporarily disable problematic features if necessary
   # Scale up services if it's a capacity issue
   docker-compose up -d --scale backend=3
   ```

### Database Connection Issues
**Alert**: `DatabaseConnectionIssues`
**Symptom**: `pg_up == 0`

#### Immediate Actions
1. **Check Database Status**
   ```bash
   # Check PostgreSQL container
   docker ps | grep postgres
   docker logs postgres --tail 100
   
   # Check connection from backend
   docker exec austa-backend npm run db:ping
   ```

2. **Check Connection Pool**
   ```bash
   # Monitor connection pool metrics
   curl http://prometheus:9090/api/v1/query?query=pg_stat_database_numbackends
   
   # Check for connection leaks
   docker exec postgres psql -U postgres -c "SELECT * FROM pg_stat_activity;"
   ```

3. **Recovery Steps**
   ```bash
   # Restart database if necessary
   docker-compose restart postgres
   
   # Clear connection pools in application
   docker-compose restart backend
   ```

## Security Alerts Response

### Multiple Failed Login Attempts
**Alert**: `MultipleFailedLogins`
**Symptom**: > 10 failed logins in 5 minutes

#### Immediate Actions
1. **Investigate Source**
   ```bash
   # Check failed login sources
   grep "failed_login" logs/security-*.log | tail -50
   
   # Check IP addresses
   curl "http://elasticsearch:9200/austa-logs-*/_search" \
     -H "Content-Type: application/json" \
     -d '{
       "query": {
         "bool": {
           "must": [
             {"term": {"event_type": "security"}},
             {"term": {"security_event": "failed_login"}},
             {"range": {"@timestamp": {"gte": "now-5m"}}}
           ]
         }
       }
     }'
   ```

2. **Block Suspicious IPs**
   ```bash
   # Add IP to firewall block list
   sudo iptables -A INPUT -s <suspicious_ip> -j DROP
   
   # Update application-level rate limiting
   # This depends on your specific implementation
   ```

3. **Check User Accounts**
   ```bash
   # Check for compromised accounts
   docker exec postgres psql -U postgres austa_cockpit \
     -c "SELECT user_id, COUNT(*) FROM failed_logins 
         WHERE created_at > NOW() - INTERVAL '1 hour' 
         GROUP BY user_id 
         ORDER BY COUNT(*) DESC 
         LIMIT 10;"
   ```

### Suspicious Activity Alert
**Alert**: `SuspiciousActivity`
**Symptom**: Suspicious activity score > 0.8

#### Immediate Actions
1. **Investigate Activity**
   ```bash
   # Get details from security logs
   curl "http://elasticsearch:9200/austa-logs-*/_search" \
     -d '{
       "query": {
         "bool": {
           "must": [
             {"term": {"alert_level": "critical"}},
             {"term": {"log_type": "security"}}
           ]
         }
       },
       "sort": [{"@timestamp": {"order": "desc"}}]
     }'
   ```

2. **User Session Review**
   ```bash
   # Check user sessions
   docker exec redis redis-cli keys "session:*" | head -20
   
   # Review user activity patterns
   docker exec postgres psql -U postgres austa_cockpit \
     -c "SELECT * FROM user_sessions WHERE suspicious_score > 0.5 ORDER BY last_activity DESC LIMIT 10;"
   ```

3. **Containment Actions**
   ```bash
   # Temporarily suspend suspicious user accounts
   # Force logout of suspicious sessions
   # Increase monitoring for affected users
   ```

## Performance Alerts Response

### High Response Time Alert
**Alert**: `HighResponseTime`
**Symptom**: 95th percentile > 2 seconds

#### Investigation Steps
1. **Check Current Performance**
   ```bash
   # Get current response times
   curl http://prometheus:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket[5m]))
   
   # Check top slow endpoints
   curl http://prometheus:9090/api/v1/query?query=topk(10,rate(http_request_duration_seconds_sum[5m]))
   ```

2. **Resource Utilization**
   ```bash
   # Check CPU usage
   curl http://prometheus:9090/api/v1/query?query=100-avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))*100
   
   # Check memory usage
   curl http://prometheus:9090/api/v1/query?query=(1-node_memory_MemAvailable_bytes/node_memory_MemTotal_bytes)*100
   ```

3. **Database Performance**
   ```bash
   # Check slow queries
   docker exec postgres psql -U postgres -c "SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"
   
   # Check database connections
   docker exec postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
   ```

### High Memory Usage Alert
**Alert**: `HighMemoryUsage`
**Symptom**: Memory usage > 85%

#### Immediate Actions
1. **Identify Memory Consumers**
   ```bash
   # Check container memory usage
   docker stats --no-stream
   
   # Check system processes
   ps aux --sort=-%mem | head -20
   ```

2. **Application Memory Analysis**
   ```bash
   # Check Node.js heap usage
   curl http://backend:8000/metrics | grep nodejs_heap
   
   # Check Python memory usage in AI service
   docker exec austa-ai-service python -c "
   import psutil
   process = psutil.Process()
   print(f'Memory: {process.memory_info().rss / 1024 / 1024:.2f} MB')
   "
   ```

3. **Memory Recovery**
   ```bash
   # Restart high-memory containers
   docker-compose restart backend
   
   # Clear caches if needed
   docker exec redis redis-cli FLUSHALL
   
   # Restart services in order
   docker-compose restart ai-service
   ```

## Business Metrics Alerts

### High Case Processing Time
**Alert**: `HighCaseProcessingTime`
**Symptom**: 95th percentile > 5 minutes

#### Investigation
1. **Check Case Queue**
   ```bash
   # Check pending cases
   curl http://backend:8000/business-metrics | grep pending_cases
   
   # Check AI service queue
   curl http://ai-service:8001/health-metrics | jq '.processing_queue_size'
   ```

2. **AI Service Performance**
   ```bash
   # Check AI model performance
   curl http://ai-service:8001/ai-performance
   
   # Check GPU utilization if available
   nvidia-smi || echo "No GPU available"
   ```

### Low AI Accuracy Alert
**Alert**: `LowAIAccuracy`
**Symptom**: AI accuracy < 85%

#### Investigation Steps
1. **Check Model Status**
   ```bash
   # Get current model metrics
   curl http://ai-service:8001/fraud-metrics
   
   # Check model last training dates
   curl http://ai-service:8001/models/status
   ```

2. **Data Quality Check**
   ```bash
   # Check recent training data quality
   # Review model performance trends
   # Check for data drift
   ```

## Communication Templates

### Critical Incident Announcement
```
Subject: [CRITICAL] AUSTA Cockpit Service Disruption

We are currently experiencing a service disruption affecting AUSTA Cockpit.

Impact: [Describe user impact]
Start Time: [Incident start time]
Current Status: [What we're doing about it]
ETA for Resolution: [Best estimate]

We will provide updates every 15 minutes until resolved.

For real-time updates: http://status.austa.com
```

### Resolution Announcement
```
Subject: [RESOLVED] AUSTA Cockpit Service Restored

The service disruption affecting AUSTA Cockpit has been resolved.

Duration: [Total incident duration]
Root Cause: [Brief explanation]
Resolution: [What was done to fix it]

We apologize for any inconvenience caused. A detailed post-incident review will be published within 48 hours.
```

## Post-Incident Actions

### Immediate (0-2 hours)
- [ ] Confirm service restoration
- [ ] Remove any temporary fixes
- [ ] Update monitoring/alerting if needed
- [ ] Brief management on impact

### Short-term (2-24 hours)
- [ ] Collect all logs and metrics
- [ ] Interview team members involved
- [ ] Identify timeline of events
- [ ] Begin root cause analysis

### Long-term (1-7 days)
- [ ] Complete post-incident review
- [ ] Implement preventive measures
- [ ] Update runbooks and procedures
- [ ] Share learnings with team

## Contact Information

### Escalation Chain
1. **On-call Engineer**: +1-XXX-XXX-XXXX
2. **Senior Engineer**: +1-XXX-XXX-XXXX
3. **Team Lead**: +1-XXX-XXX-XXXX
4. **Engineering Manager**: +1-XXX-XXX-XXXX

### External Contacts
- **Cloud Provider Support**: Account-specific contact
- **Security Team**: security@austa.com
- **Database Admin**: dba@austa.com
- **Network Team**: network@austa.com