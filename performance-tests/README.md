# AUSTA Cockpit Performance Testing Framework

A comprehensive performance testing suite for AUSTA Cockpit featuring multiple testing tools, automated monitoring, and regression testing capabilities.

## Overview

This framework provides:
- **Load Testing** with k6 for realistic user scenarios
- **Stress Testing** with Artillery for high-load conditions  
- **Frontend Performance** testing with Lighthouse
- **Complex Workflow Testing** with JMeter
- **Real-time Monitoring** and metrics collection
- **Performance Baselines** and SLA definitions
- **Automated Regression Testing** pipeline

## Directory Structure

```
performance-tests/
├── config/
│   └── performance.config.js         # Main configuration
├── scripts/
│   ├── k6/                           # k6 load testing scripts
│   │   ├── auth-load-test.js
│   │   ├── case-processing-test.js
│   │   ├── ai-service-test.js
│   │   └── dashboard-stress-test.js
│   ├── artillery/                    # Artillery stress testing
│   │   ├── stress-test.yml
│   │   ├── auth-stress.yml
│   │   └── api-stress.yml
│   ├── lighthouse/                   # Frontend performance testing
│   │   ├── lighthouse-runner.js
│   │   └── lighthouse-config.json
│   ├── jmeter/                       # Complex workflow testing
│   │   ├── workflow-test.jmx
│   │   └── run-jmeter-test.sh
│   ├── monitoring/                   # Performance monitoring
│   │   ├── performance-monitor.js
│   │   └── grafana-dashboard.json
│   ├── baseline/                     # Baseline creation
│   │   └── create-baseline.js
│   └── regression/                   # Regression testing
│       └── performance-regression.js
├── results/                          # Test results and reports
├── baselines/                        # Performance baselines
└── package.json                      # Dependencies and scripts
```

## Quick Start

### 1. Installation

```bash
cd performance-tests
npm install
```

### 2. Environment Setup

Copy and configure environment variables:

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Create Performance Baseline

```bash
# Create initial performance baseline
npm run baseline

# Or run directly
node scripts/baseline/create-baseline.js create
```

### 4. Run Performance Tests

```bash
# Run all tests
npm run test:all

# Run specific test types
npm run test:load        # k6 load tests
npm run test:stress      # Artillery stress tests
npm run test:lighthouse  # Frontend performance
npm run test:jmeter      # Complex workflows
```

### 5. Start Performance Monitoring

```bash
# Start real-time monitoring
npm run monitor

# Or run directly
node scripts/monitoring/performance-monitor.js start
```

## Testing Tools

### k6 Load Testing

Simulates realistic user load patterns:

```bash
# Authentication load testing
npm run test:auth

# Case processing throughput
npm run test:cases  

# AI service performance
npm run test:ai

# Dashboard stress testing
npm run test:dashboard
```

**Key Scenarios:**
- Concurrent user logins (burst and sustained)
- Case creation and processing workflows
- AI analysis and chat interactions
- Real-time dashboard updates
- Database query performance

### Artillery Stress Testing

High-load stress testing for breaking points:

```bash
# General stress test
npm run test:stress

# Authentication-focused stress
artillery run scripts/artillery/auth-stress.yml

# API endpoint stress testing
artillery run scripts/artillery/api-stress.yml
```

**Features:**
- Progressive load increase
- Spike testing
- Error rate monitoring
- Rate limiting validation
- Recovery testing

### Lighthouse Frontend Performance

Automated frontend performance auditing:

```bash
# Run Lighthouse tests
npm run test:lighthouse

# Continuous monitoring
node scripts/lighthouse/lighthouse-runner.js monitor 60
```

**Metrics Tracked:**
- Performance scores
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Cumulative Layout Shift (CLS)
- Time to Interactive (TTI)
- Accessibility and SEO scores

### JMeter Workflow Testing

Complex end-to-end workflow testing:

```bash
# Run workflow tests
npm run test:jmeter

# Custom configuration
./scripts/jmeter/run-jmeter-test.sh -n 100 -d 900 -r 180
```

**Workflow Coverage:**
- Complete fraud detection workflow
- User authentication and session management
- Case creation, analysis, and processing
- Dashboard and analytics access
- Multi-step business processes

## Performance Monitoring

### Real-time Monitoring

Continuous monitoring with alerting:

```bash
# Start monitoring
node scripts/monitoring/performance-monitor.js start

# Generate current report
node scripts/monitoring/performance-monitor.js report
```

**Monitoring Capabilities:**
- Service health checks
- Response time tracking
- Error rate monitoring
- System resource usage
- Database performance
- AI service metrics

### Grafana Dashboard

Import the provided Grafana dashboard:

```bash
# Dashboard configuration
scripts/monitoring/grafana-dashboard.json
```

**Dashboard Features:**
- Service availability overview
- Response time trends
- System resource utilization
- Performance SLA status
- Real-time alerts

## Performance Baselines & SLAs

### SLA Requirements

| Category | Response Time P95 | Response Time P99 | Error Rate | Availability |
|----------|------------------|------------------|------------|-------------|
| Authentication | 1000ms | 2000ms | 0.1% | 99.9% |
| Core Functionality | 2000ms | 5000ms | 0.5% | 99.8% |
| AI Services | 8000ms | 15000ms | 1.0% | 99.5% |
| Analytics | 3000ms | 8000ms | 1.0% | 99.0% |
| Search | 2000ms | 5000ms | 0.5% | 99.5% |

### Baseline Management

```bash
# Create new baseline
node scripts/baseline/create-baseline.js create

# Compare with existing baseline  
node scripts/baseline/create-baseline.js compare
```

## Regression Testing

### Automated Pipeline

```bash
# Run regression test
npm run test:regression

# CI/CD integration
node scripts/regression/performance-regression.js
```

**Regression Detection:**
- 20% response time degradation threshold
- 5% error rate increase threshold
- Baseline comparison analysis
- Automated alerts for regressions
- CI/CD integration with fail conditions

### CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Performance Regression Test
on: [push, pull_request]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - name: Install dependencies
        run: |
          cd performance-tests
          npm install
      - name: Run regression tests
        run: |
          cd performance-tests
          npm run test:regression
```

## Configuration

### Environment Variables

Key configuration options in `.env`:

```env
# Service URLs
BASE_URL=http://localhost:3000
API_URL=http://localhost:8000
AI_SERVICE_URL=http://localhost:8001

# Test Configuration
MAX_VUS=500
TEST_DURATION=10m
RAMP_UP_DURATION=2m

# Performance Thresholds
RESPONSE_TIME_P95=1000
RESPONSE_TIME_P99=2000
ERROR_RATE_MAX=0.01

# Monitoring
INFLUXDB_HOST=localhost
GRAFANA_URL=http://localhost:3001
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

### Test Customization

Modify test parameters in `config/performance.config.js`:

```javascript
module.exports = {
  sla: {
    responseTime: {
      p95: 1000,
      p99: 2000,
      avg: 500
    },
    errorRate: {
      max: 0.01
    }
  },
  // ... additional configuration
};
```

## Results and Reporting

### Test Results

Results are saved in `results/` directory:

```
results/
├── k6/                    # k6 test results
├── artillery/             # Artillery results  
├── lighthouse/            # Lighthouse reports
├── jmeter/               # JMeter test results
└── regression/           # Regression test reports
```

### Report Formats

- **JSON**: Detailed metrics and raw data
- **HTML**: Interactive reports (JMeter, Lighthouse)
- **Markdown**: Summary reports for documentation
- **CSV**: Data export for analysis

### Automated Notifications

Configure notifications for performance issues:

- **Slack**: Webhook integration for alerts
- **Email**: SMTP notifications
- **Dashboard**: Real-time Grafana alerts

## Best Practices

### Test Design

1. **Realistic Load Patterns**: Base tests on actual user behavior
2. **Gradual Load Increase**: Use ramp-up periods to avoid false failures
3. **Think Time**: Include realistic delays between requests
4. **Data Variety**: Use diverse test data sets
5. **Error Handling**: Test both success and failure scenarios

### Performance Optimization

1. **Database Queries**: Monitor and optimize slow queries
2. **Caching**: Implement appropriate caching strategies
3. **Connection Pooling**: Optimize database connections
4. **Resource Management**: Monitor CPU, memory, and I/O usage
5. **Content Delivery**: Optimize asset delivery and compression

### Monitoring Strategy

1. **Continuous Monitoring**: Run 24/7 health checks
2. **Threshold Alerts**: Set appropriate alert thresholds
3. **Trend Analysis**: Monitor performance trends over time
4. **Capacity Planning**: Use data for infrastructure planning
5. **Root Cause Analysis**: Correlate metrics with application changes

## Troubleshooting

### Common Issues

1. **Connection Timeouts**: Check network connectivity and service health
2. **High Error Rates**: Validate test data and service configuration
3. **Resource Exhaustion**: Monitor system resources during tests
4. **Authentication Failures**: Verify test credentials and token management
5. **Data Consistency**: Ensure test data cleanup between runs

### Debug Mode

Enable verbose logging:

```bash
DEBUG=performance-tests:* npm run test:load
```

### Performance Analysis

1. **Response Time Spikes**: Check for garbage collection or database locks
2. **Memory Leaks**: Monitor memory usage patterns
3. **CPU Bottlenecks**: Profile application code
4. **Network Issues**: Analyze network latency and bandwidth
5. **Database Performance**: Review query execution plans

## Support

For issues and questions:

1. Check the troubleshooting section above
2. Review test logs in `results/` directory
3. Monitor system metrics during test execution
4. Validate environment configuration
5. Consult performance testing best practices

## Contributing

1. Follow existing code patterns and conventions
2. Add tests for new performance scenarios
3. Update documentation for configuration changes
4. Validate changes against baseline performance
5. Include performance impact analysis in PRs