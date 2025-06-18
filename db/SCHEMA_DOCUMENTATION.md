# AUSTA Cockpit Database Schema Documentation

## Overview

The AUSTA Cockpit database is designed for healthcare quality control, authorization management, and fraud detection. It uses PostgreSQL with multiple schemas for logical separation of concerns.

## Schema Architecture

### Database Schemas

1. **auth** - Authentication and user management
2. **medical** - Medical cases, procedures, and authorizations  
3. **ai** - AI models and analysis results
4. **audit** - Audit trails and compliance tracking
5. **analytics** - Performance metrics and reporting

## Core Entities

### Authentication Schema (auth)

#### Organizations
- Represents healthcare providers, insurers, administrators, and auditors
- Types: provider, insurer, administrator, auditor
- Contains tax ID and status tracking
- Supports metadata for custom attributes

#### Users
- System users with role-based access control
- Roles: admin, doctor, nurse, auditor, analyst, reviewer
- Includes license tracking for medical professionals
- Account security features (lockout, failed attempts)

#### Sessions
- Secure session management
- Token-based authentication
- IP and user agent tracking

#### Permissions & Role Mappings
- Fine-grained permission system
- Resource-based access control
- Role-permission associations

### Medical Schema (medical)

#### Patients
- Anonymized patient records (HIPAA compliant)
- Uses patient codes instead of personal identifiers
- Risk categorization (low, medium, high, critical)
- Chronic condition tracking

#### Procedures
- Medical procedure catalog
- CPT/HCPCS code mapping
- Pre-authorization requirements
- Risk level assessment

#### Authorization Requests
- Prior authorization workflow
- Urgency levels (routine, urgent, emergency)
- Clinical justification and diagnosis codes
- Supporting document management
- Status tracking through lifecycle

#### Authorization Decisions
- Decision types: automatic, manual, AI-assisted
- Approval/denial tracking with rationale
- Validity periods and conditions
- Appeal deadline management

#### Claims
- Claim submission and processing
- Links to authorizations
- Financial tracking (billed, allowed, paid amounts)
- Status workflow management

### AI Schema (ai)

#### AI Models
- Model registry for different AI capabilities
- Types: authorization, fraud detection, risk assessment, pattern analysis
- Version control and accuracy tracking
- Deployment status management

#### Analysis Results
- AI-generated insights and recommendations
- Confidence and risk scoring
- Entity-agnostic design for flexibility
- Performance metrics (processing time)

#### Fraud Indicators
- Configurable fraud detection rules
- Severity levels (low to critical)
- Detection logic in JSON format
- Active/inactive status

#### Fraud Detections
- Fraud case management
- Investigation workflow
- Evidence collection
- Resolution tracking

### Audit Schema (audit)

#### Activity Logs
- Comprehensive user activity tracking
- Entity-based change tracking
- IP and user agent logging
- Request correlation

#### Decision Trails
- Decision audit trail
- Human vs AI decision tracking
- Override reason documentation
- Compliance check results

#### Compliance Violations
- Regulatory compliance tracking
- Severity classification
- Investigation and resolution workflow
- Regulatory reference tracking

### Analytics Schema (analytics)

#### Performance Metrics
- Generic metric storage
- Time-series data support
- Dimensional analysis capabilities
- Flexible metric types

#### Provider Metrics
- Provider performance tracking
- Authorization approval rates
- Processing time analysis
- Quality and compliance scoring

#### User Activity Summary
- User productivity metrics
- Decision accuracy tracking
- AI agreement rates
- Time-based aggregations

## Key Relationships

### Authorization Flow
```
Patient → Authorization Request → Procedure
                ↓
        Authorization Decision
                ↓
              Claim
```

### User Access
```
Organization → User → Session
                ↓
            Permissions
```

### AI Analysis
```
AI Model → Analysis Result → Entity (Authorization/Claim/Provider/Patient)
              ↓
        Fraud Detection → Investigation
```

## Security Features

### Row-Level Security (RLS)
- Enabled on sensitive tables
- Organization-based data isolation
- Provider access to patient data only through authorizations

### Audit Trail
- All data modifications tracked
- User and timestamp recording
- Change history in JSON format

### Data Privacy
- Patient anonymization
- Encrypted password storage
- Session token hashing

## Performance Optimizations

### Indexes
- Primary key indexes (UUID)
- Foreign key indexes
- Status field indexes for workflow queries
- Timestamp indexes for time-based queries
- Composite indexes for common query patterns

### Triggers
- Automatic updated_at timestamp updates
- Data validation triggers
- Audit log generation

## Migration Strategy

### Initial Setup
1. Run `001_initial_schema.sql` to create base schema
2. Load reference data (procedures, permissions)
3. Configure RLS policies
4. Set up monitoring and maintenance jobs

### Ongoing Migrations
- Use numbered migration files
- Track in schema_migrations table
- Test in staging environment first
- Include rollback scripts

## Compliance Considerations

### HIPAA Compliance
- Patient data anonymization
- Access control and audit trails
- Encryption at rest and in transit
- Data retention policies

### Regulatory Requirements
- Decision documentation
- Appeal process tracking
- Compliance violation management
- Regulatory reference tracking

## Best Practices

### Data Entry
- Use UUIDs for all primary keys
- Store timestamps in UTC
- Use appropriate data types
- Validate data at database level

### Query Patterns
- Use indexes effectively
- Leverage JSON fields for flexibility
- Implement pagination for large datasets
- Use materialized views for analytics

### Maintenance
- Regular vacuum and analyze
- Monitor index usage
- Archive old audit logs
- Update statistics regularly