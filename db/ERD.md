# AUSTA Cockpit Entity Relationship Diagram

## Entity Relationships

```mermaid
erDiagram
    %% Authentication Schema
    Organization ||--o{ User : "employs"
    User ||--o{ Session : "has"
    User }o--|| Role : "assigned"
    Role }o--o{ Permission : "grants"
    
    %% Medical Schema
    Patient ||--o{ AuthorizationRequest : "requests"
    Organization ||--o{ AuthorizationRequest : "submits"
    User ||--o{ AuthorizationRequest : "creates"
    Procedure ||--o{ AuthorizationRequest : "for"
    
    AuthorizationRequest ||--o{ AuthorizationDecision : "receives"
    User ||--o{ AuthorizationDecision : "makes"
    
    AuthorizationRequest ||--o{ Claim : "generates"
    Patient ||--o{ Claim : "has"
    Organization ||--o{ Claim : "submits"
    Procedure ||--o{ Claim : "for"
    
    %% AI Schema
    AIModel ||--o{ AnalysisResult : "produces"
    FraudIndicator ||--o{ FraudDetection : "triggers"
    User ||--o{ FraudDetection : "investigates"
    
    %% Audit Schema
    User ||--o{ ActivityLog : "generates"
    Organization ||--o{ ActivityLog : "associated"
    User ||--o{ DecisionTrail : "creates"
    
    %% Analytics Schema
    Organization ||--o{ ProviderMetrics : "measured"
    User ||--o{ UserActivitySummary : "tracked"

    %% Core Entity Attributes
    Organization {
        UUID id PK
        string name
        enum type
        string tax_id UK
        enum status
        json metadata
        timestamp created_at
        timestamp updated_at
    }
    
    User {
        UUID id PK
        UUID organization_id FK
        string email UK
        string password_hash
        string full_name
        enum role
        string license_number
        enum status
        timestamp last_login
        int failed_login_attempts
        timestamp locked_until
    }
    
    Patient {
        UUID id PK
        string patient_code UK
        int birth_year
        string gender
        string insurance_type
        enum risk_category
        json chronic_conditions
    }
    
    AuthorizationRequest {
        UUID id PK
        string request_number UK
        UUID patient_id FK
        UUID requesting_provider_id FK
        UUID requesting_doctor_id FK
        UUID procedure_id FK
        enum urgency_level
        text clinical_justification
        json diagnosis_codes
        enum status
        timestamp submitted_at
        timestamp due_date
    }
    
    AuthorizationDecision {
        UUID id PK
        UUID authorization_request_id FK
        enum decision_type
        enum decision
        UUID reviewer_id FK
        text decision_rationale
        json conditions_applied
        timestamp valid_from
        timestamp valid_until
    }
    
    Claim {
        UUID id PK
        string claim_number UK
        UUID authorization_id FK
        UUID patient_id FK
        UUID provider_id FK
        UUID procedure_id FK
        date service_date
        decimal billed_amount
        decimal allowed_amount
        decimal paid_amount
        enum status
    }
    
    AIModel {
        UUID id PK
        string name
        string version
        enum type
        enum status
        decimal accuracy_score
        json configuration
    }
    
    FraudDetection {
        UUID id PK
        enum entity_type
        UUID entity_id
        UUID indicator_id FK
        decimal confidence_score
        json evidence
        enum status
        UUID investigator_id FK
    }
```

## Key Relationship Patterns

### 1. Organization Hierarchy
- Organizations employ Users
- Users inherit organization context for data access
- Organization type determines available features

### 2. Authorization Workflow
```
Patient → Authorization Request → Decision → Claim
         ↑                      ↑
    Provider/Doctor        Reviewer/AI
```

### 3. AI Analysis Pipeline
```
Entity (Auth/Claim/Patient/Provider)
    ↓
AI Model Analysis
    ↓
Analysis Result → Fraud Detection → Investigation
```

### 4. Audit Trail
```
Every User Action → Activity Log
Every Decision → Decision Trail
Every Violation → Compliance Record
```

## Cardinality Rules

### One-to-Many (1:N)
- Organization → Users
- User → Sessions
- Patient → Authorization Requests
- Authorization Request → Decisions
- AI Model → Analysis Results

### Many-to-Many (M:N)
- Roles ↔ Permissions (via role_permissions)
- Users ↔ Authorization Decisions (as reviewers)

### One-to-One (1:1)
- Authorization Decision → Authorization Request (current decision)
- User Activity Summary → User (per day)

## Data Integrity Rules

### Cascading Deletes
- User deletion → Sessions deleted
- Permission deletion → Role associations deleted
- Organization deletion → Users orphaned (set null)

### Restricted Operations
- Cannot delete Organizations with active Authorization Requests
- Cannot delete Procedures referenced by Claims
- Cannot modify completed Authorization Decisions

### Temporal Constraints
- Authorization validity periods must not overlap
- Claims service date must be within authorization validity
- Session expiry must be future timestamp

## Access Patterns

### Provider Access
- Can only view patients they have treated
- Can submit authorization requests for their patients
- Can view their organization's metrics

### Reviewer Access  
- Can view all pending authorizations
- Can make decisions on authorizations
- Cannot modify their own decision history

### Auditor Access
- Read-only access to all data
- Can flag compliance violations
- Can export audit reports

## Performance Considerations

### Hot Paths
1. Authorization lookup by status and date
2. User authentication and session validation
3. Real-time fraud detection queries
4. Provider performance aggregations

### Indexing Strategy
- Status fields for workflow queries
- Date ranges for reporting
- Foreign keys for joins
- Composite indexes for common filters