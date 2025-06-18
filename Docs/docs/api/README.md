# AUSTA Cockpit API Documentation

## Overview

The AUSTA Cockpit API provides a comprehensive RESTful interface for managing medical authorization cases, AI-powered analysis, and audit decisions. This document covers all available endpoints, authentication methods, and integration patterns.

## Base URLs

| Environment | Base URL |
|------------|----------|
| Development | `http://localhost:3000/api/v1` |
| Staging | `https://staging-api.austa.com.br/v1` |
| Production | `https://api.austa.com.br/v1` |

## Authentication

The API uses JWT (JSON Web Token) authentication. All requests (except login) must include the authorization header:

```http
Authorization: Bearer <your-jwt-token>
```

### Obtaining Tokens

1. **Login Request**:
```bash
curl -X POST https://api.austa.com.br/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your.email@austa.com.br",
    "password": "your-password"
  }'
```

2. **Response**:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600,
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "your.email@austa.com.br",
    "name": "Your Name",
    "role": "auditor"
  }
}
```

### Token Refresh

Access tokens expire after 1 hour. Use the refresh token to obtain a new access token:

```bash
curl -X POST https://api.austa.com.br/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "your-refresh-token"
  }'
```

## Rate Limiting

API calls are rate-limited based on authentication status:

| User Type | Limit | Window |
|-----------|-------|--------|
| Anonymous | 100 requests | 1 hour |
| Authenticated | 1,000 requests | 1 hour |
| Premium | 10,000 requests | 1 hour |

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`: Total allowed requests
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Unix timestamp when limit resets

## Error Responses

All errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "email",
      "constraint": "Must be a valid email address"
    },
    "timestamp": "2024-01-26T10:30:00Z",
    "path": "/api/v1/auth/login",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### Common Error Codes

| HTTP Status | Error Code | Description |
|------------|------------|-------------|
| 400 | `BAD_REQUEST` | Invalid request format |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Resource conflict (e.g., duplicate) |
| 422 | `VALIDATION_ERROR` | Input validation failed |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |

## API Endpoints

### Authentication

#### POST /auth/login
Authenticate and receive JWT tokens.

**Request Body**:
```json
{
  "email": "ana.silva@austa.com.br",
  "password": "SecurePassword123!",
  "mfaCode": "123456"  // Optional, if MFA is enabled
}
```

**Response**: See authentication section above.

#### POST /auth/refresh
Exchange refresh token for new access token.

#### POST /auth/logout
Invalidate current session tokens.

### Cases

#### GET /cases
Retrieve paginated list of medical authorization cases.

**Query Parameters**:
- `page` (integer): Page number (default: 1)
- `limit` (integer): Items per page (default: 20, max: 100)
- `sort` (string): Sort field and order (e.g., "createdAt:desc")
- `status` (string): Filter by status (pending, in_review, approved, denied, partial)
- `priority` (string): Filter by priority (low, medium, high, urgent)
- `assignedTo` (uuid): Filter by assigned auditor
- `search` (string): Search in case description and patient info

**Example Request**:
```bash
curl -X GET "https://api.austa.com.br/v1/cases?status=pending&priority=high&limit=10" \
  -H "Authorization: Bearer <token>"
```

#### GET /cases/{caseId}
Get detailed information about a specific case.

**Response**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "caseNumber": "AUT-2024-7834",
  "patientId": "987e6543-e21b-12d3-a456-426614174000",
  "patientName": "João Silva",
  "procedureCode": "30101012",
  "procedureDescription": "Consulta médica especializada",
  "requestedValue": 250.00,
  "priority": "high",
  "status": "pending",
  "assignedTo": {
    "id": "456e7890-e89b-12d3-a456-426614174000",
    "name": "Ana Costa",
    "email": "ana.costa@austa.com.br"
  },
  "medicalHistory": [...],
  "documents": [...],
  "timeline": [...],
  "createdAt": "2024-01-26T08:00:00Z",
  "updatedAt": "2024-01-26T10:30:00Z",
  "dueDate": "2024-01-27T18:00:00Z"
}
```

#### POST /cases
Create a new medical authorization case.

**Request Body**:
```json
{
  "patientId": "987e6543-e21b-12d3-a456-426614174000",
  "procedureCode": "30101012",
  "procedureDescription": "Consulta médica especializada",
  "requestedValue": 250.00,
  "priority": "medium",
  "documents": [
    "doc-id-1",
    "doc-id-2"
  ],
  "notes": "Paciente com histórico de hipertensão"
}
```

#### PATCH /cases/{caseId}
Update case information or status.

#### POST /cases/{caseId}/assign
Assign or reassign a case to an auditor.

### AI Analysis

#### POST /ai/analyze/{caseId}
Request AI analysis for a specific case.

**Request Body**:
```json
{
  "analysisType": "full",  // full, medical, fraud, pattern
  "includeHistory": true,
  "urgency": "normal"      // normal, high
}
```

**Response**:
```json
{
  "id": "analysis-123",
  "caseId": "case-456",
  "analysisType": "full",
  "recommendation": "approve",
  "confidence": 0.92,
  "medicalAnalysis": {
    "clinicalJustification": "Procedimento adequado conforme protocolo clínico",
    "guidelineCompliance": true,
    "similarCases": [...]
  },
  "fraudAnalysis": {
    "riskScore": 0.15,
    "riskFactors": [],
    "anomalies": []
  },
  "patternAnalysis": {
    "patterns": [...]
  },
  "createdAt": "2024-01-26T10:35:00Z"
}
```

#### POST /ai/chat
Interactive chat with AI assistant for case-related questions.

**Request Body**:
```json
{
  "message": "Quais são as diretrizes clínicas para este procedimento?",
  "caseId": "123e4567-e89b-12d3-a456-426614174000",
  "conversationId": "conv-789"  // Optional, to continue conversation
}
```

### Decisions

#### POST /decisions
Record an audit decision for a case.

**Request Body**:
```json
{
  "caseId": "123e4567-e89b-12d3-a456-426614174000",
  "decision": "approved",  // approved, denied, partial
  "justification": "Procedimento adequado e dentro das diretrizes clínicas estabelecidas",
  "authorizedValue": 250.00,  // Required if decision is "partial"
  "aiAnalysisId": "analysis-123"  // Optional
}
```

#### GET /decisions/{decisionId}
Retrieve details of a specific audit decision.

### Analytics

#### GET /analytics/dashboard
Get key performance metrics for the dashboard.

**Query Parameters**:
- `period`: Time period (today, week, month, quarter, year)
- `auditorId`: Filter by specific auditor

**Response**:
```json
{
  "summary": {
    "totalCases": 1523,
    "pendingCases": 47,
    "completedCases": 1476,
    "averageProcessingTime": 4.2,
    "approvalRate": 0.87,
    "aiAccuracy": 0.94
  },
  "casesByStatus": [...],
  "casesByPriority": [...],
  "performanceTrend": [...]
}
```

#### POST /analytics/reports
Generate custom analytics reports.

### Webhooks

#### GET /webhooks
List active webhook subscriptions.

#### POST /webhooks
Create a new webhook subscription.

**Request Body**:
```json
{
  "url": "https://your-system.com/webhooks/austa",
  "events": ["case.created", "decision.made", "fraud.detected"],
  "secret": "your-webhook-secret"  // Optional
}
```

## Webhook Events

AUSTA Cockpit can send real-time notifications to your system via webhooks.

### Available Events

- `case.created`: New case submitted
- `case.updated`: Case information updated
- `decision.made`: Audit decision recorded
- `fraud.detected`: Potential fraud identified

### Webhook Payload Format

```json
{
  "event": "decision.made",
  "timestamp": "2024-01-26T10:30:00Z",
  "data": {
    // Event-specific data
  }
}
```

### Webhook Security

1. **Signature Verification**: All webhook requests include a signature header:
   ```
   X-Webhook-Signature: sha256=<signature>
   ```

2. **Verify signature in your code**:
   ```javascript
   const crypto = require('crypto');
   
   function verifyWebhookSignature(payload, signature, secret) {
     const expectedSignature = crypto
       .createHmac('sha256', secret)
       .update(payload)
       .digest('hex');
     
     return `sha256=${expectedSignature}` === signature;
   }
   ```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { AustaClient } from '@austa/cockpit-sdk';

const client = new AustaClient({
  apiKey: process.env.AUSTA_API_KEY,
  baseURL: 'https://api.austa.com.br'
});

// Get pending cases
const cases = await client.cases.list({
  status: 'pending',
  priority: 'high',
  limit: 10
});

// Analyze a case
const analysis = await client.ai.analyze(caseId, {
  analysisType: 'full'
});

// Make a decision
const decision = await client.decisions.create({
  caseId: caseId,
  decision: 'approved',
  justification: 'Meets all clinical guidelines',
  aiAnalysisId: analysis.id
});
```

### Python

```python
from austa_cockpit import AustaClient

client = AustaClient(
    api_key=os.environ['AUSTA_API_KEY'],
    base_url='https://api.austa.com.br'
)

# Get pending cases
cases = client.cases.list(
    status='pending',
    priority='high',
    limit=10
)

# Analyze a case
analysis = client.ai.analyze(
    case_id=case_id,
    analysis_type='full'
)

# Make a decision
decision = client.decisions.create(
    case_id=case_id,
    decision='approved',
    justification='Meets all clinical guidelines',
    ai_analysis_id=analysis.id
)
```

## Best Practices

1. **Error Handling**: Always implement proper error handling for API calls
2. **Retry Logic**: Implement exponential backoff for transient errors
3. **Caching**: Cache frequently accessed data to reduce API calls
4. **Pagination**: Always use pagination for list endpoints
5. **Webhooks**: Use webhooks for real-time updates instead of polling

## API Changelog

### v1.0.0 (2024-01-26)
- Initial API release
- Authentication endpoints
- Case management
- AI analysis integration
- Decision recording
- Analytics and reporting
- Webhook support

## Support

- **Email**: api-support@austa.com.br
- **Documentation**: https://docs.austa.com.br/api
- **Status Page**: https://status.austa.com.br
- **Developer Portal**: https://developers.austa.com.br